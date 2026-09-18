/**
 * PokeParty RSVP endpoint — Google Apps Script web app.
 *
 * Paste this into Extensions -> Apps Script on the Google Sheet that should
 * collect RSVPs, then Deploy -> New deployment -> Web app,
 * "Execute as: Me", "Who has access: Anyone". Copy the /exec URL.
 *
 * Guests can edit their RSVP, so every submission carries a stable `id`.
 * This UPDATES the matching row if it exists and APPENDS otherwise, so one
 * couple always occupies exactly one row no matter how often they change
 * their minds.
 */

var HEADERS = [
  "id", "submittedAt", "revision", "attending",
  "name", "starter", "starterDex",
  "plusOne", "plusOneStarter", "plusOneDex",
  "note", "rivalNamed", "rivalPokemon", "wonBattle", "attempts"
];

function doPost(e) {
  var lock = LockService.getScriptLock();       // two guests can submit at once
  lock.waitLock(20000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var d = JSON.parse(e.postData.contents);

    // first write of the day: lay down a header row
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }

    var row = [
      d.id, d.submittedAt, d.revision, d.attending ? "YES" : "no",
      d.name, d.starter, d.starterDex,
      d.plusOne, d.plusOneStarter, d.plusOneDex,
      d.note, d.rivalNamed, d.rivalPokemon, d.wonBattle ? "won" : "", d.attempts
    ];

    var last = sheet.getLastRow();
    if (last > 1) {
      var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === String(d.id)) {
          sheet.getRange(i + 2, 1, 1, row.length).setValues([row]);
          return ContentService.createTextOutput("updated");
        }
      }
    }
    sheet.appendRow(row);
    return ContentService.createTextOutput("added");
  } catch (err) {
    // keep a trace of anything malformed rather than losing it silently
    try {
      SpreadsheetApp.getActiveSpreadsheet()
        .getSheets()[0]
        .appendRow(["ERROR", new Date().toISOString(), String(err),
                    e && e.postData ? e.postData.contents : ""]);
    } catch (ignored) {}
    return ContentService.createTextOutput("error: " + err);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Two jobs:
 *
 *   /exec                       -> "alive" text, a handy sanity check
 *   /exec?verify=<id>&rev=<n>   -> did that RSVP actually land?
 *
 * The site posts RSVPs with mode:"no-cors" because Apps Script cannot answer a
 * CORS preflight, and an opaque response like that always looks successful --
 * the browser will not reveal the status code. So after posting, the site asks
 * this endpoint whether the row really exists, via JSONP (a <script> tag),
 * which CAN read a cross-origin response. Only the random id is sent, never a
 * guest's name or message.
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.verify) return ContentService.createTextOutput("PokeParty RSVP endpoint is alive.");

  var out = { id: p.verify, found: false, revision: null, ok: false };
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var last = sheet.getLastRow();
    if (last > 1) {
      // columns 1..3 are id, submittedAt, revision
      var rows = sheet.getRange(2, 1, last - 1, 3).getValues();
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][0]) === String(p.verify)) {
          out.found = true;
          out.revision = Number(rows[i][2]);
          break;
        }
      }
    }
    // an edit is only confirmed once the stored revision has caught up
    out.ok = out.found && (!p.rev || out.revision >= Number(p.rev));
  } catch (err) {
    out.error = String(err);
  }

  var json = JSON.stringify(out);

  // JSONP. The callback name is echoed into executable JavaScript, so allow
  // nothing but the identifier characters the site actually generates.
  if (p.callback && /^[A-Za-z0-9_]{1,64}$/.test(p.callback)) {
    return ContentService
      .createTextOutput(p.callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
