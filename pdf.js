/* Arbeitsbericht als PDF (Aufbau wie die Excel-Vorlage).
   Die Berichtsdaten stecken zusätzlich unsichtbar im PDF (Schlüsselwörter "ABH1:<base64-JSON>"),
   damit die PC-App den Bericht samt Unterschriften wieder einlesen kann. */
(function (global) {
  'use strict';

  const WEIN = [91, 25, 43], GRAU = [110, 110, 110], LINIE = [190, 190, 190], TEXT = [48, 48, 48];

  /** Minuten auf 15 runden (10:21 -> 10:15, 10:23 -> 10:30), wie in der PC-App. */
  function runden(min) { return Math.floor(min / 15 + 0.5) * 15; }
  function minuten(hhmm) {
    const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  function hhmm(min) { return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }

  /** Eine Zeitzeile auswerten: gerundete Zeiten, Pause (0:45 ab mehr als 6 h) und Stunden. */
  function zeile(z) {
    const v = minuten(z.von), b = minuten(z.bis);
    if (v == null || b == null) return { ok: false, stunden: 0 };
    const vr = runden(v), br = runden(b);
    const brutto = (br - vr) / 60;
    const pause = brutto > 6 ? 0.75 : 0;
    return { ok: br > vr, von: hhmm(vr), bis: hhmm(br), pause, stunden: Math.max(0, brutto - pause) };
  }
  function summe(zeiten) { return (zeiten || []).reduce((s, z) => s + zeile(z).stunden, 0); }

  function datumDE(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
  }
  function zahl(x) { return x.toFixed(2).replace('.', ','); }

  function base64Utf8(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function erstelle(jsPDF, d, logo) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const L = 15, B = 180, R = L + B, UNTEN = 282;
    let y = 15;

    const farbe = (c) => doc.setTextColor(c[0], c[1], c[2]);
    const schrift = (gr, fett) => { doc.setFont('helvetica', fett ? 'bold' : 'normal'); doc.setFontSize(gr); };
    const linie = (x1, y1, x2, y2, c = LINIE, w = 0.2) => { doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(w); doc.line(x1, y1, x2, y2); };
    const platz = (h) => { if (y + h > UNTEN) { doc.addPage(); y = 15; } };

    function titel(t) {
      platz(14);
      y += 4;
      schrift(10.5, true); farbe(WEIN); doc.text(t, L, y);
      linie(L, y + 1.6, R, y + 1.6, WEIN, 0.5);
      y += 6;
      farbe(TEXT);
    }

    /** Tabelle: spalten = [{t: Überschrift, w: Breite, a: 'right'|undefined}], zeilen = Array von Arrays. */
    function tabelle(spalten, zeilen, fussZeile) {
      platz(14);
      schrift(8, true); farbe(GRAU);
      let x = L;
      for (const s of spalten) { doc.text(s.t, s.a === 'right' ? x + s.w - 1 : x + 1, y, s.a === 'right' ? { align: 'right' } : undefined); x += s.w; }
      y += 1.8; linie(L, y, R, y, GRAU, 0.3); y += 4.6;
      schrift(9.5, false); farbe(TEXT);
      for (const z of zeilen) {
        const teile = spalten.map((s, i) => doc.splitTextToSize(String(z[i] ?? ''), s.w - 2));
        const h = Math.max(1, ...teile.map(t => t.length)) * 4.3 + 2;
        platz(h + 2);
        x = L;
        spalten.forEach((s, i) => {
          if (s.a === 'right') doc.text(teile[i], x + s.w - 1, y, { align: 'right' });
          else doc.text(teile[i], x + 1, y);
          x += s.w;
        });
        y += h - 4.3;
        linie(L, y, R, y);
        y += 4.6;
      }
      if (fussZeile) {
        schrift(9.5, true);
        x = L;
        spalten.forEach((s, i) => {
          const t = fussZeile[i] ?? '';
          if (t) { if (s.a === 'right') doc.text(t, x + s.w - 1, y, { align: 'right' }); else doc.text(t, x + 1, y); }
          x += s.w;
        });
        y += 5;
        schrift(9.5, false);
      }
    }

    // ---------- Kopf ----------
    if (logo) { try { doc.addImage(logo, 'PNG', L, y - 2, 46, 16); } catch (e) { /* ohne Logo weiter */ } }
    schrift(20, true); farbe(WEIN); doc.text('Arbeitsbericht', R, y + 7, { align: 'right' });
    schrift(7.5, false); farbe(GRAU);
    doc.text('HPG Informationstechnologie GmbH, Laubgasse 10, A-8055 Graz · Telefon: 0316 409495-0', R, y + 12.5, { align: 'right' });
    y += 22;

    // ---------- Kopfdaten ----------
    const zeiten = (d.zeiten || []).filter(z => z.datum);
    const daten = zeiten.map(z => z.datum).sort();
    let datum = daten.length ? datumDE(daten[0]) : datumDE(d.erstellt);
    if (daten.length && daten[daten.length - 1] !== daten[0]) datum += ' – ' + datumDE(daten[daten.length - 1]);
    const felder = [
      { t: 'Kunde', v: d.kunde, w: 62 },
      { t: 'Projekt-Nr', v: d.nr, w: 28 },
      { t: 'Projekt', v: d.projekt, w: 58 },
      { t: 'Datum', v: datum, w: 32 },
    ];
    schrift(10, true);
    const hoehe = Math.max(...felder.map(f => doc.splitTextToSize(f.v || '', f.w - 4).length)) * 4.6 + 10;
    doc.setDrawColor(LINIE[0], LINIE[1], LINIE[2]); doc.setLineWidth(0.3);
    doc.roundedRect(L, y, B, hoehe, 1.5, 1.5);
    let x = L;
    felder.forEach((f, i) => {
      if (i > 0) linie(x, y, x, y + hoehe, LINIE, 0.3);
      schrift(7.5, false); farbe(GRAU); doc.text(f.t, x + 2, y + 4.5);
      schrift(10, true); farbe(TEXT); doc.text(doc.splitTextToSize(f.v || '', f.w - 4), x + 2, y + 9.5);
      x += f.w;
    });
    y += hoehe + 3;

    // ---------- Tätigkeiten ----------
    titel('Tätigkeiten');
    schrift(10, false);
    const taet = (d.taetigkeiten || '').split('\n').map(t => t.trim()).filter(Boolean);
    const taetZeilen = taet.length ? taet : [''];
    for (const t of taetZeilen) {
      const teile = doc.splitTextToSize(t, B - 2);
      teile.forEach((teil, i) => {
        platz(7);
        doc.text(teil, L + 1, y);
        if (i === teile.length - 1) { y += 1.8; linie(L, y, R, y); y += 4.4; } else y += 4.6;
      });
    }

    // ---------- Arbeitszeit ----------
    titel('Arbeitszeit');
    const zz = zeiten.slice().sort((a, b) => (a.datum + a.von).localeCompare(b.datum + b.von)).map(z => {
      const e = zeile(z);
      return [datumDE(z.datum), d.name || '', e.ok ? e.von : z.von || '', e.ok ? e.bis : z.bis || '', e.pause ? '0:45' : '', e.ok ? zahl(e.stunden) : ''];
    });
    tabelle([
      { t: 'Datum', w: 26 }, { t: 'Name', w: 64 }, { t: 'von', w: 20 }, { t: 'bis', w: 20 },
      { t: 'Pause', w: 20, a: 'right' }, { t: 'Techniker Std.', w: 30, a: 'right' },
    ], zz.length ? zz : [['', '', '', '', '', '']], ['Summe', '', '', '', '', zahl(summe(zeiten))]);

    // ---------- Material ----------
    const mat = (d.material || []).filter(m => (m.menge || m.einheit || m.bezeichnung));
    titel('Beigestelltes Material');
    tabelle([{ t: 'Menge', w: 22 }, { t: 'Einheit', w: 22 }, { t: 'Bezeichnung', w: 136 }],
      mat.length ? mat.map(m => [m.menge, m.einheit, m.bezeichnung]) : [['', '', '']]);

    // ---------- Offene Punkte ----------
    const off = (d.offene || []).filter(o => (o.bis || o.name || o.bemerkung));
    titel('Offene Punkte / Nächste Schritte');
    tabelle([{ t: 'Bis', w: 26 }, { t: 'Name', w: 44 }, { t: 'Bemerkung', w: 110 }],
      off.length ? off.map(o => [o.bis, o.name, o.bemerkung]) : [['', '', '']]);

    // ---------- Unterschriften ----------
    platz(52);
    y += 5;
    schrift(9, false); farbe(TEXT);
    doc.text('Hiermit bestätigen wir die Richtigkeit der oben angeführten Einträge.', L, y);
    y += 4;
    const bw = 86, bh = 30;
    const boxen = [
      { x: L, t: 'Unterschrift Fa. Intratec', bild: d.sigTechniker, name: d.name },
      { x: R - bw, t: 'Unterschrift Kunde', bild: d.sigKunde, name: d.kundeName },
    ];
    for (const bx of boxen) {
      if (bx.bild) {
        try {
          const p = doc.getImageProperties(bx.bild);
          const f = Math.min((bw - 4) / p.width, (bh - 4) / p.height);
          const w = p.width * f, h = p.height * f;
          doc.addImage(bx.bild, 'PNG', bx.x + (bw - w) / 2, y + (bh - h) / 2, w, h);
        } catch (e) { /* Bild fehlerhaft */ }
      }
      linie(bx.x, y + bh, bx.x + bw, y + bh, TEXT, 0.3);
      schrift(8, false); farbe(GRAU);
      doc.text(bx.t + (bx.name ? ': ' + bx.name : ''), bx.x, y + bh + 4);
    }
    if (d.unterschriebenAm) {
      const t = new Date(d.unterschriebenAm);
      doc.text('Unterschrieben am ' + t.toLocaleDateString('de-AT') + ' um ' + t.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }) + (d.ort ? ', ' + d.ort : ''), R - bw, y + bh + 8);
    }

    // ---------- Fußzeile auf jeder Seite ----------
    const seiten = doc.getNumberOfPages();
    for (let i = 1; i <= seiten; i++) {
      doc.setPage(i);
      schrift(7, false); farbe(GRAU);
      doc.text(`Arbeitsbericht ${d.nr || ''} · ${d.id || ''}`, L, 292);
      doc.text(`Seite ${i} von ${seiten}`, R, 292, { align: 'right' });
    }

    // Daten für die PC-App unsichtbar mitgeben
    doc.setProperties({
      title: `Arbeitsbericht ${d.nr || ''} ${datum}`.trim(),
      subject: [d.kunde, d.projekt].filter(Boolean).join(' – '),
      author: d.name || '',
      creator: 'Arbeitsberichte Handy',
      keywords: 'ABH1:' + base64Utf8(JSON.stringify(d)),
    });
    return doc;
  }

  function dateiname(d) {
    const daten = (d.zeiten || []).map(z => z.datum).filter(Boolean).sort();
    const tag = daten[0] || (d.erstellt || '').slice(0, 10);
    const sauber = (s) => String(s || '').replace(/[^\w\-äöüÄÖÜß]+/g, '_').replace(/^_+|_+$/g, '');
    return `Arbeitsbericht_${sauber(d.nr) || 'ohneNr'}_${tag}${d.kuerzel ? '_' + sauber(d.kuerzel) : ''}.pdf`;
  }

  global.ABH = { erstelle, dateiname, zeile, summe, runden, minuten, hhmm, datumDE, zahl };
})(typeof window !== 'undefined' ? window : globalThis);
