// ============================================================================
// CHECKSHEET REPORT BUILDER
// API pattern: ajaxGet / ajaxPost with XHR (matches reference project)
// ============================================================================

// ============================================================================
// API CONFIGURATION
// Hardcoded to dev while building.
// TODO: restore isDev detection when deploying to production:
//   var isDev    = location.origin.includes("app-dev.mekari.com");
//   var API_BASE = isDev
//     ? "https://api-officeless-dev.mekari.com/28086"
//     : "https://api-officeless.mekari.com/28086";
// ============================================================================

var API_BASE = "https://api-officeless-dev.mekari.com/28086";

console.log("Origin  :", location.origin);
console.log("API_BASE:", API_BASE);

// ============================================================================
// API ENDPOINTS
// ============================================================================

var API = {
    getAllLocations: API_BASE + "/checksheet/api/get-all-locations",
    getAllUsers: API_BASE + "/checksheet/api/get-all-users",
    getAllChecksheets: API_BASE + "/checksheet/api/get-all-checksheets",
    saveReport: API_BASE + "/checksheet/api/save-compiled-report", // placeholder
};

// ============================================================================
// GLOBAL STATE
// ============================================================================

var allRows = [];
var filteredRows = [];
var selectedIds = {};   // plain object used as a Set  { id: true }
var sortCol = "date";
var sortDir = "desc";

// ============================================================================
// INITIALIZATION
// ============================================================================

window.onload = function () {
    fetchData();
};

// ============================================================================
// AJAX HELPERS  (same pattern as reference project)
// ============================================================================

function ajaxGet(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);

    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    callback(JSON.parse(xhr.responseText));
                } catch (e) {
                    console.error("JSON Parse Error:", url, e);
                }
            } else {
                console.error("AJAX GET ERROR:", url, xhr.status);
            }
        }
    };

    xhr.send();
}

function ajaxPost(url, data, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/json");

    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    var response = xhr.responseText
                        ? JSON.parse(xhr.responseText)
                        : { success: true };
                    callback(response);
                } catch (e) {
                    console.error("JSON Parse Error:", url, e);
                    callback({ success: true });
                }
            } else {
                console.error("POST ERROR:", url, xhr.status, xhr.responseText);
                callback({ success: false, message: "Request failed" });
            }
        }
    };

    xhr.send(JSON.stringify(data));
}

// ============================================================================
// FETCH DATA
// Each request is independent — a 404 on one endpoint will NOT
// block the others from populating their respective UI.
// ============================================================================

function fetchData() {
    showSkeletonRows(8);

    // 1. Checksheet rows → render table
    ajaxGet(API.getAllChecksheets, function (res) {
        if (res.success) {
            allRows = (res.data || []).map(normalizeChecksheetRow);
        } else {
            console.error("Failed to load checksheets:", res.message);
            showErrorState(res.message || "Failed to load checksheets");
        }
        applyFilters();
    });

    // 2. Users → inspector filter dropdown
    // Response: { user_id, user_name, role }
    ajaxGet(API.getAllUsers, function (res) {
        if (res.success) {
            populateInspectorDropdown(res.data || []);
        } else {
            console.error("Failed to load users:", res.message);
        }
    });

    // 3. Locations → location filter dropdown
    // Response: { location_id, location_name, area_type }
    ajaxGet(API.getAllLocations, function (res) {
        if (res.success) {
            populateLocationDropdown(res.data || []);
        } else {
            console.error("Failed to load locations:", res.message);
        }
    });
}

// ============================================================================
// NORMALIZE
// Maps /get-all-checksheets response item → internal row shape.
//
// Real API response fields:
//   checksheet_id, date (timestamp ms), location_id, location_name, area_type,
//   inspector_id, inspector_name,
//   cleanliness, equipment, lightning, signage, obstruction,
//   attachment (url string or null), notes
//
// Status values from API: "OK" | "Somewhat OK" | "Not OK"
// ============================================================================

function normalizeChecksheetRow(item) {
    return {
        id: item.checksheet_id,
        date: timestampToDate(item.date),
        inspector_id: item.inspector_id || "",
        inspector_name: item.inspector_name || "",
        location_id: item.location_id || "",
        location_name: item.location_name || "",
        area_type: item.area_type || "",
        cleanliness: item.cleanliness || "—",
        equipment: item.equipment || "—",
        lightning: item.lightning || "—",
        signage: item.signage || "—",
        obstruction: item.obstruction || "—",
        has_attachment: !!item.attachment,
        attachment_url: item.attachment || "",
        notes: item.notes || "",
        report_status: item.report_status || "",
        report_id: item.report_id || "",
    };
}

// ============================================================================
// TIMESTAMP HELPER
// API returns date as Unix ms timestamp (e.g. 1772582400000)
// ============================================================================

function timestampToDate(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd;
}

// ============================================================================
// DROPDOWN POPULATION
// ============================================================================

function populateLocationDropdown(items) {
    // Item shape: { location_id, location_name, area_type }
    var fLoc = document.getElementById("fLocation");
    fLoc.innerHTML = "<option value=''>All Locations</option>";
    for (var i = 0; i < items.length; i++) {
        var opt = document.createElement("option");
        opt.value = items[i].location_name;
        opt.textContent = items[i].location_name;
        fLoc.appendChild(opt);
    }
}

function populateInspectorDropdown(items) {
    // Item shape: { user_id, user_name, role }
    var fIns = document.getElementById("fInspector");
    fIns.innerHTML = "<option value=''>All Inspectors</option>";
    for (var i = 0; i < items.length; i++) {
        var opt = document.createElement("option");
        opt.value = items[i].user_name;
        opt.textContent = items[i].user_name;
        fIns.appendChild(opt);
    }
}

// ============================================================================
// FILTER & SORT
// ============================================================================

function applyFilters() {
    var date = document.getElementById("fDate").value;
    var loc = document.getElementById("fLocation").value;
    var ins = document.getElementById("fInspector").value;
    var sts = document.getElementById("fStatus").value;

    filteredRows = allRows.filter(function (r) {
        if (date && r.date !== date) return false;
        if (loc && r.location_name !== loc) return false;
        if (ins && r.inspector_name !== ins) return false;

        // "nok" filter = any status is "Not OK" or "Somewhat OK"
        var statuses = [r.cleanliness, r.equipment, r.lightning, r.signage, r.obstruction];
        if (sts === "ok" && statuses.some(function (s) {
            return s === "Not OK" || s === "Somewhat OK";
        })) return false;
        if (sts === "nok" && !statuses.some(function (s) {
            return s === "Not OK" || s === "Somewhat OK";
        })) return false;

        return true;
    });

    sortRows();
}

function resetFilters() {
    document.getElementById("fDate").value = "";
    document.getElementById("fLocation").value = "";
    document.getElementById("fInspector").value = "";
    document.getElementById("fStatus").value = "";
    applyFilters();
}

function sortTable(col) {
    sortDir = (sortCol === col && sortDir === "asc") ? "desc" : "asc";
    sortCol = col;
    sortRows();
}

function sortRows() {
    filteredRows.sort(function (a, b) {
        var va = String(a[sortCol] || "").toLowerCase();
        var vb = String(b[sortCol] || "").toLowerCase();
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
    });
    renderTable(filteredRows);
}

// ============================================================================
// RENDER TABLE
// Columns: checkbox | date | inspector | location | area_type |
//          cleanliness | equipment | lightning | signage | obstruction |
//          attachment | notes
// ============================================================================

function renderTable(rows) {
    var tbody = document.getElementById("tableBody");

    if (!rows.length) {
        tbody.innerHTML =
            '<tr><td colspan="12">' +
            '<div class="empty-state">' +
            '<svg width="40" height="40" viewBox="0 0 24 24" fill="none"' +
            ' stroke="currentColor" stroke-width="1.5">' +
            '<rect x="3" y="3" width="18" height="18" rx="3"/>' +
            '<path d="M9 9h6M9 12h6M9 15h4"/>' +
            "</svg>" +
            "<p>No records found</p>" +
            "<small>Try adjusting your filters</small>" +
            "</div>" +
            "</td></tr>";
        return;
    }

    var html = "";
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var sel = !!selectedIds[row.id];
        html +=
            '<tr class="' + (sel ? "selected" : "") + '"' +
            ' onclick="toggleRow(\'' + row.id + '\', event)"' +
            ' data-id="' + row.id + '">' +

            '<td class="cb-cell">' +
            '<div class="custom-cb ' + (sel ? "checked" : "") + '" id="cb_' + row.id + '">' +
            '<svg width="10" height="10" viewBox="0 0 10 10"' +
            ' fill="none" stroke="#fff" stroke-width="2">' +
            '<polyline points="1.5,5 3.8,7.5 8.5,2.5"/>' +
            "</svg>" +
            "</div>" +
            "</td>" +

            '<td style="font-variant-numeric:tabular-nums;font-size:12px;">' +
            escHtml(row.date) +
            "</td>" +

            "<td>" +
            '<span class="chip">' + escHtml(row.inspector_name) + "</span>" +
            "</td>" +

            "<td><strong>" + escHtml(row.location_name) + "</strong></td>" +

            '<td style="font-size:12px;color:#64748b;">' + escHtml(row.area_type) + "</td>" +

            "<td>" + statusPill(row.cleanliness) + "</td>" +
            "<td>" + statusPill(row.equipment) + "</td>" +
            "<td>" + statusPill(row.lightning) + "</td>" +
            "<td>" + statusPill(row.signage) + "</td>" +
            "<td>" + statusPill(row.obstruction) + "</td>" +

            "<td>" +
            (row.has_attachment
                ? '<a href="' + escHtml(row.attachment_url) + '" target="_blank"' +
                ' class="attach-icon" title="View attachment">📎</a>'
                : '<span class="no-attach">—</span>') +
            "</td>" +

            '<td class="notes-cell" title="' + escHtml(row.notes) + '">' +
            (escHtml(row.notes) || "—") +
            "</td>" +

            "</tr>";
    }
    tbody.innerHTML = html;
    updateSelectionUI();
}

// ============================================================================
// STATUS PILL
// API values: "OK" | "Somewhat OK" | "Not OK"
// ============================================================================

function statusPill(val) {
    if (!val || val === "—") {
        return '<span class="pill pill-na"><span class="pill-dot"></span>—</span>';
    }
    if (val === "OK") {
        return '<span class="pill pill-ok"><span class="pill-dot"></span>OK</span>';
    }
    if (val === "Somewhat OK") {
        return '<span class="pill pill-warn"><span class="pill-dot"></span>Somewhat OK</span>';
    }
    // "Not OK"
    return '<span class="pill pill-nok"><span class="pill-dot"></span>Not OK</span>';
}

function escHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ============================================================================
// SKELETON & ERROR STATE
// ============================================================================

function showSkeletonRows(count) {
    var tbody = document.getElementById("tableBody");
    var html = "";
    for (var i = 0; i < count; i++) {
        html += "<tr>";
        for (var j = 0; j < 12; j++) {
            var w = 55 + Math.floor(Math.random() * 35);
            html += '<td><div class="skeleton" style="width:' + w + '%"></div></td>';
        }
        html += "</tr>";
    }
    tbody.innerHTML = html;
}

function showErrorState(message) {
    document.getElementById("tableBody").innerHTML =
        '<tr><td colspan="12">' +
        '<div class="empty-state">' +
        '<svg width="36" height="36" viewBox="0 0 24 24" fill="none"' +
        ' stroke="currentColor" stroke-width="1.5">' +
        '<circle cx="12" cy="12" r="10"/>' +
        '<line x1="12" y1="8"  x2="12"    y2="12"/>' +
        '<line x1="12" y1="16" x2="12.01" y2="16"/>' +
        "</svg>" +
        "<p>Could not load records</p>" +
        "<small>" + escHtml(message) + "</small>" +
        "</div>" +
        "</td></tr>";
}

// ============================================================================
// ROW SELECTION
// Using plain object { id: true } instead of Set for compatibility.
// ============================================================================

function toggleRow(id, e) {
    if (e && e.target.tagName === "svg") return;

    if (selectedIds[id]) {
        delete selectedIds[id];
    } else {
        selectedIds[id] = true;
    }

    var tr = document.querySelector('tr[data-id="' + id + '"]');
    if (tr) {
        var sel = !!selectedIds[id];
        tr.classList.toggle("selected", sel);
        var cb = document.getElementById("cb_" + id);
        if (cb) cb.classList.toggle("checked", sel);
    }
    updateSelectionUI();
}

function toggleMaster() {
    var allSel = filteredRows.length > 0 && filteredRows.every(function (r) {
        return !!selectedIds[r.id];
    });
    for (var i = 0; i < filteredRows.length; i++) {
        if (allSel) { delete selectedIds[filteredRows[i].id]; }
        else { selectedIds[filteredRows[i].id] = true; }
    }
    renderTable(filteredRows);
}

function selectAll() {
    for (var i = 0; i < filteredRows.length; i++) {
        selectedIds[filteredRows[i].id] = true;
    }
    renderTable(filteredRows);
}

function clearSelection() {
    selectedIds = {};
    renderTable(filteredRows);
}

function getSelectedCount() {
    return Object.keys(selectedIds).length;
}

function updateSelectionUI() {
    var n = getSelectedCount();
    var off = n === 0;

    document.getElementById("selCount").textContent =
        n === 0 ? "0 selected" : n + " selected";

    document.getElementById("selInfo").innerHTML = n
        ? "<strong>" + n + " record" + (n > 1 ? "s" : "") + "</strong> selected for report"
        : "Select rows to compile into a report";

    document.getElementById("compileBtn").disabled = off;
    document.getElementById("exportPdfBtn").disabled = off;
    document.getElementById("submitBtn").disabled = off;

    var allSel = filteredRows.length > 0 && filteredRows.every(function (r) {
        return !!selectedIds[r.id];
    });
    document.getElementById("masterCb").classList.toggle("checked", allSel);
}

// ============================================================================
// COMPILE MODAL
// ============================================================================

function openPreview() {
    var selected = allRows.filter(function (r) { return !!selectedIds[r.id]; });
    selected.sort(function (a, b) { return a.date < b.date ? -1 : 1; });

    document.getElementById("previewSubtitle").textContent =
        selected.length + " record" + (selected.length !== 1 ? "s" : "") + " selected";

    if (selected.length) {
        var dates = selected.map(function (r) { return r.date; }).sort();
        var first = dates[0];
        var last = dates[dates.length - 1];
        document.getElementById("reportPeriod").value =
            first === last ? first : first + " \u2192 " + last;
    }

    var html = "";
    for (var i = 0; i < selected.length; i++) {
        var r = selected[i];
        html +=
            "<tr>" +
            '<td style="color:#94a3b8;font-size:11px;">' + (i + 1) + "</td>" +
            '<td style="font-size:12px;font-variant-numeric:tabular-nums;">' + escHtml(r.date) + "</td>" +
            "<td><strong>" + escHtml(r.inspector_name) + "</strong></td>" +
            "<td>" + escHtml(r.location_name) + "</td>" +
            '<td style="color:#64748b;">' + escHtml(r.area_type) + "</td>" +
            "<td>" + statusPill(r.cleanliness) + "</td>" +
            "<td>" + statusPill(r.equipment) + "</td>" +
            "<td>" + statusPill(r.lightning) + "</td>" +
            "<td>" + statusPill(r.signage) + "</td>" +
            "<td>" + statusPill(r.obstruction) + "</td>" +
            '<td style="font-size:11px;color:#64748b;max-width:120px;overflow:hidden;' +
            'text-overflow:ellipsis;white-space:nowrap;" title="' + escHtml(r.notes) + '">' +
            (escHtml(r.notes) || "—") +
            "</td>" +
            "</tr>";
    }
    document.getElementById("previewBody").innerHTML = html;
    document.getElementById("previewModal").classList.add("open");
}

function closePreview() {
    document.getElementById("previewModal").classList.remove("open");
}

document.getElementById("previewModal").addEventListener("click", function (e) {
    if (e.target === this) closePreview();
});

// ============================================================================
// EXPORT PDF
// ============================================================================

function exportPDF() {
    var selected = allRows.filter(function (r) { return !!selectedIds[r.id]; });
    selected.sort(function (a, b) { return a.date < b.date ? -1 : 1; });

    if (!selected.length) { alert("No records selected"); return; }

    var title = document.getElementById("reportTitle").value || "Checksheet Inspection Report";
    var period = document.getElementById("reportPeriod").value || "";
    var prepBy = document.getElementById("reportPrepBy").value || "";

    function sc(v) {
        if (v === "OK") return "ok";
        if (v === "Somewhat OK") return "warn";
        if (v === "Not OK") return "nok";
        return "na";
    }

    var rows = "";
    for (var i = 0; i < selected.length; i++) {
        var r = selected[i];
        rows +=
            "<tr>" +
            '<td style="color:#94a3b8">' + (i + 1) + "</td>" +
            '<td style="font-variant-numeric:tabular-nums">' + escHtml(r.date) + "</td>" +
            "<td><strong>" + escHtml(r.inspector_name) + "</strong></td>" +
            "<td><strong>" + escHtml(r.location_name) + "</strong></td>" +
            '<td style="color:#64748b">' + escHtml(r.area_type) + "</td>" +
            '<td><span class="' + sc(r.cleanliness) + '">' + escHtml(r.cleanliness) + "</span></td>" +
            '<td><span class="' + sc(r.equipment) + '">' + escHtml(r.equipment) + "</span></td>" +
            '<td><span class="' + sc(r.lightning) + '">' + escHtml(r.lightning) + "</span></td>" +
            '<td><span class="' + sc(r.signage) + '">' + escHtml(r.signage) + "</span></td>" +
            '<td><span class="' + sc(r.obstruction) + '">' + escHtml(r.obstruction) + "</span></td>" +
            '<td style="color:#64748b">' + (escHtml(r.notes) || "—") + "</td>" +
            "</tr>";
    }

    var win = window.open("", "_blank");
    win.document.write(
        "<!DOCTYPE html><html lang='en'><head>" +
        "<meta charset='UTF-8'/>" +
        "<title>" + escHtml(title) + "</title>" +
        "<link href='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' rel='stylesheet'/>" +
        "<style>" +
        "*{box-sizing:border-box;margin:0;padding:0}" +
        "body{font-family:'Inter',Arial,sans-serif;font-size:11px;color:#272b32;padding:28px 32px}" +
        ".rh{border-bottom:2px solid #4b61dc;padding-bottom:14px;margin-bottom:18px}" +
        ".rh h1{font-size:17px;font-weight:700;margin-bottom:6px}" +
        ".meta{font-size:11px;color:#64748b;display:flex;gap:20px;flex-wrap:wrap}" +
        "table{width:100%;border-collapse:collapse}" +
        "thead th{background:#f1f5f9;padding:7px 9px;text-align:left;font-size:10px;font-weight:700;" +
        "text-transform:uppercase;letter-spacing:.5px;color:#64748b;border-bottom:2px solid #e2e8f0}" +
        "tbody td{padding:6px 9px;border-bottom:1px solid #f1f5f9;vertical-align:middle}" +
        "tbody tr:nth-child(even){background:#fafbfd}" +
        ".ok  {color:#166534;background:#dcfce7;padding:2px 7px;border-radius:99px;font-weight:700;font-size:10px}" +
        ".warn{color:#92400e;background:#fef3c7;padding:2px 7px;border-radius:99px;font-weight:700;font-size:10px}" +
        ".nok {color:#991b1b;background:#fee2e2;padding:2px 7px;border-radius:99px;font-weight:700;font-size:10px}" +
        ".na  {color:#64748b;background:#f1f5f9;padding:2px 7px;border-radius:99px;font-weight:700;font-size:10px}" +
        ".sigs{margin-top:40px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px}" +
        ".sig{border-top:1px solid #272b32;padding-top:6px}" +
        ".sig-lbl{font-size:10px;color:#64748b;margin-bottom:30px}" +
        ".sig-name{font-size:11px;font-weight:600;border-top:1px solid #ccc;padding-top:4px}" +
        ".foot{margin-top:20px;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;" +
        "padding-top:10px;display:flex;justify-content:space-between}" +
        "@media print{body{padding:0}}" +
        "</style></head><body>" +
        "<div class='rh'>" +
        "<h1>" + escHtml(title) + "</h1>" +
        "<div class='meta'>" +
        "<span>Period: <strong>" + escHtml(period) + "</strong></span>" +
        "<span>Prepared by: <strong>" + escHtml(prepBy) + "</strong></span>" +
        "<span>Generated: <strong>" + new Date().toLocaleString("id-ID") + "</strong></span>" +
        "</div>" +
        "</div>" +
        "<table><thead><tr>" +
        "<th>#</th><th>Date</th><th>Inspector</th><th>Location</th><th>Area</th>" +
        "<th>Cleanliness</th><th>Equipment</th><th>Lightning</th>" +
        "<th>Signage</th><th>Obstruction</th><th>Notes</th>" +
        "</tr></thead><tbody>" + rows + "</tbody></table>" +
        "<div class='sigs'>" +
        "<div class='sig'><div class='sig-lbl'>Prepared by</div>" +
        "<div class='sig-name'>" + (escHtml(prepBy) || "&nbsp;") + "</div></div>" +
        "<div class='sig'><div class='sig-lbl'>Reviewed by</div>" +
        "<div class='sig-name'>&nbsp;</div></div>" +
        "<div class='sig'><div class='sig-lbl'>Approved by</div>" +
        "<div class='sig-name'>&nbsp;</div></div>" +
        "</div>" +
        "<div class='foot'>" +
        "<span>" + escHtml(title) + " \u2014 Confidential</span>" +
        "<span>Total records: " + selected.length + "</span>" +
        "</div>" +
        "<script>window.onload=function(){setTimeout(function(){window.print();},400)}<\/script>" +
        "</body></html>"
    );
    win.document.close();
    showToast("PDF print dialog opened", "success");
}

// ============================================================================
// SUBMIT FOR APPROVAL
//
// Step 1 — POST /save-compiled-report
//   Request body:
//   {
//     "title":           "Checksheet Inspection Report",
//     "period":          "2025-03-01 → 2025-03-31",
//     "prepared_by":     "Budi Santoso",
//     "status":          "Pending Approval",
//     "checksheet_ids":  ["id1", "id2"],
//     "total_records":   2,
//     "submitted_at":    1234567890000
//   }
//   Expected response: { success: true, data: { report_id: "xyz" }, message: "..." }
//
// Step 2 — POST /trigger-approval
//   Request body: { "report_id": "xyz" }
//   Expected response: { success: true, data: {}, message: "..." }
// ============================================================================

function submitToOfficeless() {
    var selected = allRows.filter(function (r) { return !!selectedIds[r.id]; });
    if (!selected.length) return;

    console.log("selected count:", selected.length);
    console.log("selected ids:", selected.map(function (r) { return r.id; }));

    var title = document.getElementById("reportTitle").value || "Checksheet Report";
    var period = document.getElementById("reportPeriod").value || "";
    var prepBy = document.getElementById("reportPrepBy").value || "";

    var submitBtns = document.querySelectorAll("#submitBtn, #modalSubmitBtn");
    for (var i = 0; i < submitBtns.length; i++) submitBtns[i].disabled = true;

    showToast("Submitting report for approvalu2026", "");

    // POST /save-compiled-report
    // Officeless auto-triggers the approval workflow on record creation,
    // so a single POST is all that is needed.
    //
    // Request body:
    // {
    //   "title":           "Checksheet Inspection Report",
    //   "period":          "2025-03-01 u2192 2025-03-31",
    //   "prepared_by":     "Budi Santoso",
    //   "status":          "Pending Approval",
    //   "checksheet_ids":  ["id1", "id2"],
    //   "total_records":   2,
    //   "submitted_at":    1234567890000
    // }
    //
    // Expected response:
    // {
    //   "data":    { "record_id": "xYz123AbCdEf", "title": "...", "status": "Pending Approval", ... },
    //   "message": "report submitted successfully",
    //   "success": true
    // }
    ajaxPost(API.saveReport, {
        title: title,
        period: period,
        prepared_by: prepBy,
        status: "Pending Approval",
        checksheet_ids: selected.map(function (r) { return r.id; }),
        total_records: selected.length,
        submitted_at: Date.now(),
    }, function (res) {
        if (res.success) {
            console.log("Report created, record_id:", res.data && res.data.record_id);
            showToast("Report submitted for approval!", "success");
            closePreview();
            clearSelection();
            fetchData(); // re-fetch so submitted rows disappear from the table
        } else {
            showToast("Submission failed: " + (res.message || "Unknown error"), "error");
        }
        for (var i = 0; i < submitBtns.length; i++) submitBtns[i].disabled = false;
    });
}

// ============================================================================
// TOAST
// ============================================================================

function showToast(message, type) {
    var wrap = document.getElementById("toastWrap");
    var el = document.createElement("div");
    el.className = "toast" + (type ? " " + type : "");
    el.textContent = message;
    wrap.appendChild(el);
    requestAnimationFrame(function () {
        requestAnimationFrame(function () { el.classList.add("show"); });
    });
    setTimeout(function () {
        el.classList.remove("show");
        setTimeout(function () {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 300);
    }, 3500);
}