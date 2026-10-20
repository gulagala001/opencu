const sheets = new Map();

/** Parse each stylesheet once per document; every shadow root adopts the same object. */
export function adoptReaStyles(target, ...texts) {
  const own = texts.filter(Boolean).map(text => {
    let sheet = sheets.get(text);
    if (!sheet) { sheet = new CSSStyleSheet(); sheet.replaceSync(text); sheets.set(text, sheet); }
    return sheet;
  });
  target.adoptedStyleSheets = [...target.adoptedStyleSheets.filter(sheet => !own.includes(sheet)), ...own];
}
