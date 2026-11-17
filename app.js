/* Arbeitsberichte – Handy-App (läuft komplett im Browser, Daten bleiben auf dem Gerät) */
(function () {
  'use strict';
  const VERSION = '1.4';
  const $ = (id) => document.getElementById(id);
  const K = { berichte: 'abh.berichte', einst: 'abh.einst', projekte: 'abh.projekte' };

  // ---------- Speicher ----------
  function laden(k, std) { try { const t = localStorage.getItem(k); return t ? JSON.parse(t) : std; } catch (e) { return std; } }
  function sichern(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { toast('Speichern fehlgeschlagen – Speicher voll?'); return false; }
  }
  let berichte = laden(K.berichte, []);
  let einst = laden(K.einst, { name: '', kuerzel: '', sig: null });
  let projekte = laden(K.projekte, { stand: null, liste: [] });
  let aktuell = null;
  let logo = null;

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  fetch('logo.png').then(r => r.blob()).then(b => new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); }))
    .then(d => { logo = d; }).catch(() => {});

  // ---------- Hilfen ----------
  const heute = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const jetztGerundet = () => { const d = new Date(); return ABH.hhmm(Math.min(23 * 60 + 45, ABH.runden(d.getHours() * 60 + d.getMinutes()))); };
  function neueId() {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return `H${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${Math.random().toString(36).slice(2, 5)}`;
  }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  let toastTimer;
  function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 3200); }
  function speichern() {
    if (aktuell) { aktuell.geaendert = new Date().toISOString(); }
    sichern(K.berichte, berichte);
  }

  // ---------- Navigation ----------
  function seite(name) {
    for (const s of ['Liste', 'Editor', 'Einst']) $('seite' + s).hidden = s !== name;
    $('zurueck').hidden = name === 'Liste';
    $('einstKnopf').hidden = name !== 'Liste';
    window.scrollTo(0, 0);
  }
  function zurListe() { aktuell = null; seite('Liste'); $('titel').textContent = 'Arbeitsberichte'; listeZeigen(); }
  $('zurueck').onclick = () => history.back();
  window.addEventListener('popstate', () => { if ($('sigDialog').hidden) zurListe(); else sigSchliessen(); });

  // ---------- Liste ----------
  function listeZeigen() {
    const el = $('liste');
    const sortiert = berichte.slice().sort((a, b) => (b.geaendert || '').localeCompare(a.geaendert || ''));
    $('leer').hidden = sortiert.length > 0;
    el.innerHTML = sortiert.map(b => {
      const daten = (b.zeiten || []).map(z => z.datum).filter(Boolean).sort();
      const datum = daten.length ? ABH.datumDE(daten[0]) + (daten[daten.length - 1] !== daten[0] ? ' – ' + ABH.datumDE(daten[daten.length - 1]) : '') : '';
      const pille = b.status === 'fertig'
        ? (b.geteiltPc ? '<span class="pille pc">am PC</span>' : '<span class="pille fertig">unterschrieben</span>')
        : '<span class="pille entwurf">Entwurf</span>';
      return `<button class="eintrag" data-id="${esc(b.id)}">
        <div class="z1"><span class="nr">${esc(b.nr || 'ohne Nr.')}</span>${pille}<span class="std">${ABH.zahl(ABH.summe(b.zeiten))} Std.</span></div>
        <div class="z2">${esc([b.kunde, b.projekt].filter(Boolean).join(' – ') || '–')}</div>
        <div class="z2">${esc(datum)}</div></button>`;
    }).join('');
    el.querySelectorAll('.eintrag').forEach(k => k.onclick = () => oeffnen(k.dataset.id));
  }

  $('neu').onclick = () => {
    const b = {
      v: 1, id: neueId(), erstellt: new Date().toISOString(), status: 'entwurf',
      nr: '', kunde: '', projekt: '', name: einst.name || '', kuerzel: einst.kuerzel || '',
      zeiten: [{ datum: heute(), von: '07:00', bis: jetztGerundet() }],
      taetigkeiten: '', material: [], offene: [],
      kundeName: '', sigKunde: null, sigTechniker: null, unterschriebenAm: null,
    };
    berichte.push(b);
    speichern();
    oeffnen(b.id);
  };

  // ---------- Editor ----------
  function oeffnen(id) {
    aktuell = berichte.find(b => b.id === id);
    if (!aktuell) return;
    history.pushState({ s: 'editor' }, '');
    seite('Editor');
    editorFuellen();
  }

  function titelSetzen() { $('titel').textContent = aktuell.nr ? 'Bericht ' + aktuell.nr : 'Neuer Bericht'; }

  function editorFuellen() {
    const b = aktuell;
    titelSetzen();
    $('nr').value = b.nr; $('kunde').value = b.kunde; $('projekt').value = b.projekt;
    $('taetigkeiten').value = b.taetigkeiten; $('kundeName').value = b.kundeName || '';
    $('vorschlaege').innerHTML = '';
    zeitenZeigen(); materialZeigen(); offeneZeigen(); sigZeigen();
    sperre();
  }

  function sperre() {
    const fertig = aktuell.status === 'fertig';
    $('gesperrt').hidden = !fertig;
    $('seiteEditor').querySelectorAll('input, textarea').forEach(e => e.disabled = fertig);
    for (const id of ['zeitNeu', 'materialNeu', 'offenNeu', 'sigKundeKnopf', 'sigTechKnopf', 'sigTechGespeichert'])
      $(id).hidden = fertig;
    $('seiteEditor').querySelectorAll('.posten .weg').forEach(e => e.hidden = fertig);
    $('fertig').hidden = fertig;
    $('teilenBereich').hidden = !fertig;
    $('sigTechGespeichert').disabled = !einst.sig;
  }

  for (const f of ['nr', 'kunde', 'projekt', 'taetigkeiten', 'kundeName']) {
    $(f).addEventListener('input', () => { aktuell[f] = $(f).value; speichern(); if (f === 'nr') { titelSetzen(); vorschlaege(); } });
  }

  // Projekt-Vorschläge aus der PC-Liste und eigenen Berichten
  function alleProjekte() {
    const m = new Map();
    for (const p of projekte.liste || []) if (p.nr) m.set(p.nr, p);
    for (const b of berichte) if (b.nr && !m.has(b.nr) && b !== aktuell) m.set(b.nr, { nr: b.nr, kunde: b.kunde, projekt: b.projekt });
    return [...m.values()];
  }
  function vorschlaege() {
    const q = $('nr').value.trim().toLowerCase();
    const el = $('vorschlaege');
    if (q.length < 2) { el.innerHTML = ''; return; }
    const treffer = alleProjekte().filter(p =>
      p.nr.toLowerCase().includes(q) || (p.kunde || '').toLowerCase().includes(q) || (p.projekt || '').toLowerCase().includes(q))
      .filter(p => p.nr !== $('nr').value.trim()).slice(0, 6);
    el.innerHTML = treffer.map(p => `<button data-nr="${esc(p.nr)}"><b>${esc(p.nr)}</b> · ${esc(p.kunde || '')} – ${esc(p.projekt || '')}</button>`).join('');
    el.querySelectorAll('button').forEach(k => k.onclick = () => {
      const p = treffer.find(x => x.nr === k.dataset.nr);
      aktuell.nr = p.nr; aktuell.kunde = p.kunde || ''; aktuell.projekt = p.projekt || '';
      $('nr').value = aktuell.nr; $('kunde').value = aktuell.kunde; $('projekt').value = aktuell.projekt;
      el.innerHTML = ''; titelSetzen(); speichern();
    });
  }
  $('nr').addEventListener('blur', () => setTimeout(() => {
    // exakte Nr. eingetippt: Kunde/Projekt ergänzen, wenn noch leer
    const p = alleProjekte().find(x => x.nr === $('nr').value.trim());
    if (p && !aktuell.kunde && !aktuell.projekt) {
      aktuell.kunde = p.kunde || ''; aktuell.projekt = p.projekt || '';
      $('kunde').value = aktuell.kunde; $('projekt').value = aktuell.projekt; speichern();
    }
  }, 250));

  /** Wiederholte Posten (Zeiten, Material, offene Punkte) */
  function posten(containerId, liste, felder, klasse, nachEingabe) {
    const el = $(containerId);
    el.innerHTML = liste.map((x, i) => `<div class="posten mit-weg" data-i="${i}">
      <button class="weg" data-i="${i}" aria-label="Entfernen">✕</button>
      <div class="raster ${klasse}">${felder.map(f => `<label class="${f.breit ? 'breit' : ''}">${f.t}
        <input type="${f.typ || 'text'}" data-f="${f.k}" value="${esc(x[f.k])}" ${f.typ === 'time' ? 'step="900"' : ''} ${f.im ? `inputmode="${f.im}"` : ''}></label>`).join('')}</div>
      ${nachEingabe ? `<div class="std" data-std="${i}"></div>` : ''}</div>`).join('');
    el.querySelectorAll('.posten').forEach(p => {
      const i = +p.dataset.i;
      p.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
        liste[i][inp.dataset.f] = inp.value; speichern(); if (nachEingabe) nachEingabe();
      }));
    });
    el.querySelectorAll('.weg').forEach(k => k.onclick = () => { liste.splice(+k.dataset.i, 1); speichern(); posten(containerId, liste, felder, klasse, nachEingabe); if (nachEingabe) nachEingabe(); });
  }

  function zeitenZeigen() {
    posten('zeiten', aktuell.zeiten, [
      { k: 'datum', t: 'Datum', typ: 'date', breit: true }, { k: 'von', t: 'Von', typ: 'time' }, { k: 'bis', t: 'Bis', typ: 'time' },
    ], '', summeZeigen);
    summeZeigen();
  }
  function summeZeigen() {
    $('summe').textContent = ABH.zahl(ABH.summe(aktuell.zeiten)) + ' Std.';
    aktuell.zeiten.forEach((z, i) => {
      const el = document.querySelector(`[data-std="${i}"]`);
      if (!el) return;
      const e = ABH.zeile(z);
      el.textContent = e.ok ? `Im Bericht: ${e.von} – ${e.bis}${e.pause ? ', 0:45 Pause' : ''} = ${ABH.zahl(e.stunden)} Std.` : (z.von && z.bis ? 'Bis muss nach Von liegen' : '');
    });
  }
  $('zeitNeu').onclick = () => {
    const letzte = aktuell.zeiten[aktuell.zeiten.length - 1];
    aktuell.zeiten.push({ datum: letzte ? letzte.datum : heute(), von: letzte ? letzte.bis : '07:00', bis: jetztGerundet() });
    speichern(); zeitenZeigen(); sperre();
  };

  function materialZeigen() {
    posten('material', aktuell.material, [
      { k: 'menge', t: 'Menge', im: 'decimal' }, { k: 'einheit', t: 'Einheit' }, { k: 'bezeichnung', t: 'Bezeichnung' },
    ], 'drei');
  }
  $('materialNeu').onclick = () => { aktuell.material.push({ menge: '', einheit: 'Stk', bezeichnung: '' }); speichern(); materialZeigen(); sperre(); };

  function offeneZeigen() {
    posten('offene', aktuell.offene, [
      { k: 'bis', t: 'Bis' }, { k: 'name', t: 'Name' }, { k: 'bemerkung', t: 'Bemerkung', breit: true },
    ], '');
  }
  $('offenNeu').onclick = () => { aktuell.offene.push({ bis: '', name: einst.name || '', bemerkung: '' }); speichern(); offeneZeigen(); sperre(); };

  // ---------- Unterschriften ----------
  function sigZeigen() {
    const setz = (bild, leer, wert) => { $(bild).hidden = !wert; $(leer).hidden = !!wert; if (wert) $(bild).src = wert; };
    setz('sigKundeBild', 'sigKundeLeer', aktuell.sigKunde);
    setz('sigTechBild', 'sigTechLeer', aktuell.sigTechniker);
  }
  $('sigKundeKnopf').onclick = () => sigOeffnen('Unterschrift Kunde' + (aktuell.kundeName ? ': ' + aktuell.kundeName : ''), (d) => {
    aktuell.sigKunde = d; aktuell.unterschriebenAm = d ? new Date().toISOString() : null; speichern(); sigZeigen();
  });
  $('sigTechKnopf').onclick = () => sigOeffnen('Unterschrift Fa. Intratec', (d) => { aktuell.sigTechniker = d; speichern(); sigZeigen(); });
  $('sigTechGespeichert').onclick = () => { if (einst.sig) { aktuell.sigTechniker = einst.sig; speichern(); sigZeigen(); } };

  // Zeichenfläche
  const cv = $('sigCanvas'), ctx = cv.getContext('2d');
  // Striche werden in CSS-Pixeln gemerkt: so passt der Finger immer zur Linie (auch nach dem Drehen),
  // und beim Drehen wird die Unterschrift passend neu gezeichnet statt gelöscht.
  let sigFertig = null, gezeichnet = false, zeichnet = false;
  let striche = [], strich = null, flaeche = { w: 0, h: 0 };
  function strichZeichnen(s) {
    const dpr = cv.width / Math.max(1, flaeche.w);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = ctx.fillStyle = '#10204a'; ctx.lineWidth = 2.6 * dpr;
    if (s.length === 1) { ctx.beginPath(); ctx.arc(s[0].x * dpr, s[0].y * dpr, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); return; }
    ctx.beginPath(); ctx.moveTo(s[0].x * dpr, s[0].y * dpr);
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1], b = s[i];
      ctx.quadraticCurveTo(a.x * dpr, a.y * dpr, (a.x + b.x) / 2 * dpr, (a.y + b.y) / 2 * dpr);
    }
    const l = s[s.length - 1]; ctx.lineTo(l.x * dpr, l.y * dpr); ctx.stroke();
  }
  function sigGroesse() {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (r.width < 10 || r.height < 10) return;
    if (Math.abs(r.width - flaeche.w) < 1 && Math.abs(r.height - flaeche.h) < 1 && cv.width === Math.round(r.width * dpr)) return;
    // vorhandene Striche in die neue Fläche einpassen (Seitenverhältnis bleibt)
    if (striche.length && flaeche.w) {
      const f = Math.min(r.width / flaeche.w, r.height / flaeche.h);
      const dx = (r.width - flaeche.w * f) / 2, dy = (r.height - flaeche.h * f) / 2;
      striche = striche.map(s => s.map(p => ({ x: p.x * f + dx, y: p.y * f + dy })));
    }
    flaeche = { w: r.width, h: r.height };
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    ctx.clearRect(0, 0, cv.width, cv.height);
    striche.forEach(strichZeichnen);
  }
  function sigLeeren() { striche = []; strich = null; gezeichnet = false; ctx.clearRect(0, 0, cv.width, cv.height); }
  function sigOeffnen(titel, fertig) {
    sigFertig = fertig;
    $('sigDialogTitel').textContent = titel;
    $('sigDialog').hidden = false;
    history.pushState({ s: 'sig' }, '');
    flaeche = { w: 0, h: 0 }; sigLeeren();
    requestAnimationFrame(sigGroesse);
  }
  function sigSchliessen() { $('sigDialog').hidden = true; sigFertig = null; }
  // Größe immer nach dem Layout prüfen (iOS meldet "resize" beim Drehen, bevor die Fläche fertig ist)
  if (window.ResizeObserver) new ResizeObserver(() => { if (!$('sigDialog').hidden) sigGroesse(); }).observe(cv);
  const spaeter = () => { if (!$('sigDialog').hidden) [50, 250, 600].forEach(t => setTimeout(sigGroesse, t)); };
  window.addEventListener('resize', spaeter); window.addEventListener('orientationchange', spaeter);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', spaeter);
  /** Fingerposition in CSS-Pixeln der Fläche – immer frisch gemessen. */
  function punkt(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault(); sigGroesse(); cv.setPointerCapture(e.pointerId); zeichnet = true;
    strich = [punkt(e)]; striche.push(strich); strichZeichnen(strich); gezeichnet = true;
  });
  cv.addEventListener('pointermove', (e) => {
    if (!zeichnet || !strich) return; e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const dpr = cv.width / Math.max(1, flaeche.w);
    for (const ev of evs) {
      const p = punkt(ev), a = strich[strich.length - 1];
      const v = strich.length > 1 ? strich[strich.length - 2] : a;
      strich.push(p);
      ctx.beginPath(); ctx.moveTo((v.x + a.x) / 2 * dpr, (v.y + a.y) / 2 * dpr);
      ctx.quadraticCurveTo(a.x * dpr, a.y * dpr, (a.x + p.x) / 2 * dpr, (a.y + p.y) / 2 * dpr); ctx.stroke();
    }
  });
  const ende = () => { zeichnet = false; strich = null; };
  cv.addEventListener('pointerup', ende); cv.addEventListener('pointercancel', ende); cv.addEventListener('pointerleave', ende);

  function sigExport() {
    const w = cv.width, h = cv.height, px = ctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      if (px[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return null;
    const rand = Math.round(8 * (window.devicePixelRatio || 1));
    x0 = Math.max(0, x0 - rand); y0 = Math.max(0, y0 - rand); x1 = Math.min(w - 1, x1 + rand); y1 = Math.min(h - 1, y1 + rand);
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, f = Math.min(1, 900 / bw, 320 / bh);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(bw * f)); out.height = Math.max(1, Math.round(bh * f));
    out.getContext('2d').drawImage(cv, x0, y0, bw, bh, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }
  $('sigLoeschen').onclick = () => sigLeeren();
  $('sigAbbrechen').onclick = () => history.back();
  $('sigOk').onclick = () => {
    if (!gezeichnet) { toast('Bitte zuerst unterschreiben'); return; }
    const d = sigExport(), f = sigFertig;
    history.back();
    if (f) f(d);
  };

  // ---------- Fertigstellen & Teilen ----------
  $('fertig').onclick = () => {
    const b = aktuell;
    const fehlt = [];
    if (!b.nr.trim()) fehlt.push('Projekt-Nr');
    if (!(b.zeiten || []).some(z => ABH.zeile(z).ok)) fehlt.push('eine gültige Arbeitszeit');
    if (!b.taetigkeiten.trim()) fehlt.push('Tätigkeiten');
    if (fehlt.length) { alert('Bitte noch ausfüllen: ' + fehlt.join(', ')); return; }
    if (!b.sigKunde && !confirm('Der Kunde hat noch nicht unterschrieben. Trotzdem abschließen?')) return;
    if (!b.name) b.name = einst.name || '';
    if (!b.kuerzel) b.kuerzel = einst.kuerzel || '';
    b.status = 'fertig';
    b.fertigAm = new Date().toISOString();
    speichern(); sperre();
    toast('Bericht abgeschlossen – jetzt teilen');
  };

  $('entsperren').onclick = () => {
    if (aktuell.sigKunde && !confirm('Zum Bearbeiten wird die Unterschrift des Kunden entfernt (der Bericht ändert sich ja). Fortfahren?')) return;
    aktuell.status = 'entwurf'; aktuell.sigKunde = null; aktuell.unterschriebenAm = null; aktuell.geteiltPc = false;
    speichern(); sigZeigen(); sperre();
  };

  function pdfDatei() {
    const d = Object.assign({}, aktuell);
    delete d.status; delete d.geteiltPc; delete d.geteiltKunde;
    const doc = ABH.erstelle(window.jspdf.jsPDF, d, logo);
    return new File([doc.output('blob')], ABH.dateiname(d), { type: 'application/pdf' });
  }
  async function teilen(zweck) {
    let datei;
    try { datei = pdfDatei(); } catch (e) { alert('PDF konnte nicht erstellt werden: ' + e.message); return; }
    if (navigator.canShare && navigator.canShare({ files: [datei] })) {
      try {
        await navigator.share({ files: [datei], title: datei.name });
      } catch (e) {
        if (e.name === 'AbortError') return;
        herunterladen(datei);
      }
    } else herunterladen(datei);
    if (zweck === 'pc') aktuell.geteiltPc = true; else aktuell.geteiltKunde = true;
    speichern();
  }
  function herunterladen(datei) {
    const url = URL.createObjectURL(datei), a = document.createElement('a');
    a.href = url; a.download = datei.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  $('teilenKunde').onclick = () => teilen('kunde');
  $('teilenPc').onclick = () => teilen('pc');
  $('ansehen').onclick = () => {
    try {
      const url = URL.createObjectURL(pdfDatei());
      if (!window.open(url, '_blank')) location.href = url;
    } catch (e) { alert('PDF konnte nicht erstellt werden: ' + e.message); }
  };

  $('loeschen').onclick = () => {
    if (!confirm('Diesen Bericht wirklich vom Handy löschen?' + (aktuell.status === 'fertig' && !aktuell.geteiltPc ? '\n\nAchtung: Er wurde noch nicht an den PC übertragen.' : ''))) return;
    berichte = berichte.filter(b => b !== aktuell);
    sichern(K.berichte, berichte);
    history.back();
  };

  // ---------- Alle Berichte (Übersicht vom PC) ----------
  let reiter = laden('abh.reiter', 'handy');
  function reiterSetzen(r) {
    reiter = r; sichern('abh.reiter', r);
    $('reiterHandy').classList.toggle('aktiv', r === 'handy');
    $('reiterAlle').classList.toggle('aktiv', r === 'alle');
    $('bereichHandy').hidden = r !== 'handy';
    $('bereichAlle').hidden = r !== 'alle';
    if (r === 'alle') alleZeigen();
  }
  $('reiterHandy').onclick = () => reiterSetzen('handy');
  $('reiterAlle').onclick = () => reiterSetzen('alle');
  $('alleSuche').addEventListener('input', () => alleZeigen());
  $('alleLaden').onclick = () => $('eProjekteDatei').click();

  const QUELLE = {
    handy: '<span class="pille fertig">Handy ✍</span>',
    pc: '<span class="pille pcq">PC</span>',
    teils: '<span class="pille pcq">PC, teils Handy</span>',
    ersetzt: '<span class="pille ersetzt">PC</span>',
  };
  function alleZeigen() {
    const alle = projekte.berichte || [];
    const q = $('alleSuche').value.trim().toLowerCase();
    const liste = alle.filter(b => !q || [b.nr, b.kunde, b.projekt, b.taet, 'kw' + b.kw].join(' ').toLowerCase().includes(q));
    $('alleLeer').hidden = alle.length > 0;
    const summe = liste.reduce((s, b) => s + (b.gez ?? b.std ?? 0), 0);
    $('alleSumme').textContent = alle.length && projekte.stand ? `Stand ${new Date(projekte.stand).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' })}` : '';
    const zaehlt = liste.filter(b => b.quelle !== 'ersetzt');
    const kunden = new Set(zaehlt.map(b => (b.kunde || '').trim().toLowerCase()).filter(Boolean));
    const nrn = new Set(zaehlt.map(b => b.nr).filter(Boolean));
    $('alleSummen').hidden = !alle.length;
    $('alleSummen').innerHTML = `
      <div><b>${ABH.zahl(summe)}</b><span>Stunden</span></div>
      <div><b>${zaehlt.length}</b><span>Berichte</span></div>
      <div><b>${kunden.size}</b><span>Kunden</span></div>
      <div><b>${nrn.size}</b><span>Projekte</span></div>`;
    $('ansichtWoche').classList.toggle('aktiv', ansicht === 'woche');
    $('ansichtKunde').classList.toggle('aktiv', ansicht === 'kunde');
    const h = (b) => b.gez ?? b.std ?? 0;
    const pfeil = (offen) => `<i class="pfeil">${offen ? '▾' : '▸'}</i>`;
    const suche = q.length > 0;   // beim Suchen alles aufklappen

    if (ansicht === 'kunde') {
      const gruppen = new Map();
      for (const b of liste) {
        const k = (b.kunde || '').trim() || 'ohne Kunde';
        if (!gruppen.has(k)) gruppen.set(k, []);
        gruppen.get(k).push(b);
      }
      const reihen = [...gruppen.entries()].map(([k, g]) => ({ k, g, std: g.reduce((s, b) => s + h(b), 0) })).sort((a, b) => b.std - a.std);
      $('alleListe').innerHTML = reihen.map(({ k, g, std }) => {
        const offen = suche || offeneGruppen.has('k:' + k);
        const proj = new Map();
        for (const b of g) { if (!proj.has(b.nr)) proj.set(b.nr, []); proj.get(b.nr).push(b); }
        const zeilen = [...proj.entries()].map(([nr, pg]) => {
          const daten = pg.flatMap(b => [b.von, b.bis]).filter(Boolean).sort();
          return `<button class="projekt-zeile" data-nr="${esc(nr)}">
            <div class="z1"><span class="nr">${esc(nr || '–')}</span><span class="std">${ABH.zahl(pg.reduce((s, b) => s + h(b), 0))} Std.</span></div>
            <div class="z2">${esc(pg[0].projekt || '')}</div>
            <div class="z2">${pg.filter(b => b.quelle !== 'ersetzt').length} Berichte · ${daten.length ? ABH.datumDE(daten[0]) + ' – ' + ABH.datumDE(daten[daten.length - 1]) : ''}</div></button>`;
        }).join('');
        return `<div class="gruppe"><button class="kw-titel" data-g="k:${esc(k)}">${pfeil(offen)}${esc(k)}<span>${proj.size} Proj. · ${ABH.zahl(std)} Std.</span></button>
          <div class="gruppe-inhalt"${offen ? '' : ' hidden'}>${zeilen}</div></div>`;
      }).join('');
      $('alleListe').querySelectorAll('.projekt-zeile').forEach(z => z.onclick = () => {
        // Projekt antippen: alle Berichte dieses Projekts nach Woche zeigen
        $('alleSuche').value = z.dataset.nr; ansicht = 'woche'; sichern('abh.ansicht', ansicht); alleZeigen(); window.scrollTo(0, 0);
      });
      gruppenKlick();
      return;
    }

    // nach Woche gruppieren
    const gruppen = new Map();
    for (const b of liste) {
      const k = `${b.jahr}-${String(b.kw).padStart(2, '0')}`;
      if (!gruppen.has(k)) gruppen.set(k, []);
      gruppen.get(k).push(b);
    }
    const schluessel = [...gruppen.keys()].sort().reverse();
    if (!laden('abh.offen', null) && schluessel.length) offeneGruppen.add('w:' + schluessel[0]); // beim ersten Mal: neueste Woche offen
    $('alleListe').innerHTML = schluessel.map(k => {
      const g = gruppen.get(k), [jahr, kw] = k.split('-');
      const std = g.reduce((s, b) => s + h(b), 0);
      const offen = suche || offeneGruppen.has('w:' + k);
      return `<div class="gruppe"><button class="kw-titel" data-g="w:${k}">${pfeil(offen)}KW ${+kw} / ${jahr}<span>${g.filter(b => b.quelle !== 'ersetzt').length} Ber. · ${ABH.zahl(std)} Std.</span></button>
        <div class="gruppe-inhalt"${offen ? '' : ' hidden'}>` + g.map(b => {
        const datum = b.von ? ABH.datumDE(b.von) + (b.bis && b.bis !== b.von ? ' – ' + ABH.datumDE(b.bis) : '') : '';
        const std = b.quelle === 'teils' ? `${ABH.zahl(b.gez)} <span class="klein-grau">(${ABH.zahl(b.std)})</span>`
          : b.quelle === 'ersetzt' ? `<span class="klein-grau">(${ABH.zahl(b.std)})</span>` : ABH.zahl(b.std || 0);
        return `<button class="eintrag ${b.quelle === 'ersetzt' ? 'grau' : ''}">
          <div class="z1"><span class="nr">${esc(b.nr || '–')}</span>${QUELLE[b.quelle] || ''}<span class="std">${std} Std.</span></div>
          <div class="z2">${esc([b.kunde, b.projekt].filter(Boolean).join(' – ') || '–')}</div>
          <div class="z2">${esc(datum)}</div>
          <div class="taet">${esc(b.taet || 'Keine Tätigkeiten eingetragen.')}${b.quelle === 'ersetzt' ? '\n\nDiese Tage sind durch einen Handy-Bericht abgedeckt und zählen nicht mit.' : b.quelle === 'teils' ? '\n\nEinzelne Tage sind durch einen Handy-Bericht abgedeckt und zählen dort.' : ''}</div></button>`;
      }).join('') + '</div></div>';
    }).join('');
    $('alleListe').querySelectorAll('.eintrag').forEach(e => e.onclick = () => e.classList.toggle('offen'));
    gruppenKlick();
  }

  // Auf-/Zuklappen der Gruppen (wird gemerkt)
  let ansicht = laden('abh.ansicht', 'woche');
  const offeneGruppen = new Set(laden('abh.offen', []) || []);
  function gruppenKlick() {
    $('alleListe').querySelectorAll('.kw-titel').forEach(t => t.onclick = () => {
      const g = t.dataset.g, inhalt = t.nextElementSibling;
      const offen = inhalt.hidden;
      inhalt.hidden = !offen;
      t.querySelector('.pfeil').textContent = offen ? '▾' : '▸';
      if (offen) offeneGruppen.add(g); else offeneGruppen.delete(g);
      sichern('abh.offen', [...offeneGruppen]);
    });
  }
  $('ansichtWoche').onclick = () => { ansicht = 'woche'; sichern('abh.ansicht', ansicht); alleZeigen(); };
  $('ansichtKunde').onclick = () => { ansicht = 'kunde'; sichern('abh.ansicht', ansicht); alleZeigen(); };

  // ---------- Einstellungen ----------
  $('einstKnopf').onclick = () => {
    history.pushState({ s: 'einst' }, '');
    seite('Einst'); $('titel').textContent = 'Einstellungen';
    $('eName').value = einst.name || ''; $('eKuerzel').value = einst.kuerzel || '';
    einstSigZeigen(); projektInfo();
  };
  $('eName').addEventListener('input', () => { einst.name = $('eName').value; sichern(K.einst, einst); });
  $('eKuerzel').addEventListener('input', () => { einst.kuerzel = $('eKuerzel').value; sichern(K.einst, einst); });
  function einstSigZeigen() { $('eSigBild').hidden = !einst.sig; $('eSigLeer').hidden = !!einst.sig; if (einst.sig) $('eSigBild').src = einst.sig; }
  $('eSigKnopf').onclick = () => sigOeffnen('Meine Unterschrift', (d) => { einst.sig = d; sichern(K.einst, einst); einstSigZeigen(); });
  function projektInfo() {
    const n = (projekte.liste || []).length;
    const nb = (projekte.berichte || []).length;
    $('eProjektInfo').textContent = n || nb ? `${n} Projekte, ${nb} Berichte (Stand ${new Date(projekte.stand).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' })})` : 'Noch keine Daten vom PC geladen.';
  }
  $('eProjekteLaden').onclick = () => $('eProjekteDatei').click();
  $('eProjekteDatei').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const o = JSON.parse(await f.text());
      const liste = (Array.isArray(o) ? o : o.projekte || []).map(p => ({ nr: String(p.nr ?? p.Nr ?? ''), kunde: p.kunde ?? p.Kunde ?? '', projekt: p.projekt ?? p.Projektname ?? '' })).filter(p => p.nr);
      const ber = Array.isArray(o.berichte) ? o.berichte : [];
      if (!liste.length && !ber.length) throw new Error('keine Projekte oder Berichte in der Datei');
      projekte = { stand: o.erstellt || new Date().toISOString(), liste: liste.length ? liste : projekte.liste, berichte: ber.length ? ber : (projekte.berichte || []) };
      sichern(K.projekte, projekte);
      if (reiter === 'alle') alleZeigen();
      if (!einst.name && o.name) { einst.name = o.name; $('eName').value = o.name; }
      if (!einst.kuerzel && o.kuerzel) { einst.kuerzel = o.kuerzel; $('eKuerzel').value = o.kuerzel; }
      sichern(K.einst, einst);
      projektInfo(); toast(`${projekte.liste.length} Projekte, ${projekte.berichte.length} Berichte geladen`);
    } catch (err) { alert('Die Datei konnte nicht gelesen werden: ' + err.message); }
  };

  // ---------- Start ----------
  $('version').textContent = VERSION;
  const istIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  $('installHinweis').hidden = !(istIos && !navigator.standalone);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost'))
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  history.replaceState({ s: 'liste' }, '');
  if (!einst.name) setTimeout(() => toast('Tipp: Unter ⚙ Name, Kürzel und deine Unterschrift hinterlegen'), 600);
  listeZeigen();
  reiterSetzen(reiter);
})();
