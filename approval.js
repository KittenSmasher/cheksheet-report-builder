// ============================================================================
// approval.js — Checksheet Report Approval Page
//
// Reads ?report_id=xxx from URL, fetches report detail, renders the
// checksheet rows, and allows the approver to Approve or Reject.
//
// API pattern: ajaxGet / ajaxPost with XHR (matches project convention)
// ============================================================================

// ============================================================================
// API CONFIGURATION
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
// Replace placeholder names as you create them in Officeless.
//
// GET  /get-report-detail?report_id=xxx
//   Response:
//   {
//     "data": {
//       "record_id":        "xYz123",
//       "title":            "Checksheet Inspection Report",
//       "period":           "2025-03-01 -> 2025-03-31",
//       "prepared_by":      "Budi Santoso",
//       "submitted_at":     1234567890000,
//       "total_records":    2,
//       "status":           "Pending Approval",
//       "approved_by":      null,
//       "approved_at":      null,
//       "rejected_by":      null,
//       "rejection_reason": null,
//       "checksheets": [
//         {
//           "checksheet_id", "date" (ms timestamp),
//           "inspector_name", "location_name", "area_type",
//           "cleanliness", "equipment", "lightning", "signage", "obstruction",
//           "attachment" (url string or null), "notes"
//         }, ...
//       ]
//     },
//     "message": "report retrieved successfully",
//     "success": true
//   }
//
// POST /approve-report
//   Body    : { "report_id": "xYz123", "approved_by": "Rina Mahendra" }
//   Response: { "data": {}, "message": "report approved", "success": true }
//
// POST /reject-report
//   Body    : { "report_id": "xYz123", "rejected_by": "Rina Mahendra", "rejection_reason": "..." }
//   Response: { "data": {}, "message": "report rejected", "success": true }
// ============================================================================

var API = {
    getReportDetail: API_BASE + "/checksheet/api/get-report-detail", // placeholder
    approveReport: API_BASE + "/checksheet/api/approve-report",    // placeholder
    rejectReport: API_BASE + "/checksheet/api/reject-report",     // placeholder
};

// ============================================================================
// GLOBAL STATE
// ============================================================================

var reportData = null;
var reportId = null;
var isDecided = false;
var rejectStep = 0;

// ============================================================================
// INIT
// ============================================================================

window.onload = function () {
    reportId = getParam("report_id");

    if (!reportId) {
        showErrorState("No report_id in URL. Please open this page from the approval link.");
        return;
    }

    fetchReportDetail();
};

function getParam(key) {
    return new URLSearchParams(window.location.search).get(key);
}

// ============================================================================
// AJAX HELPERS
// ============================================================================

function ajaxGet(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            if (xhr.status >= 200 && xhr.status < 300) {
                try { callback(JSON.parse(xhr.responseText)); }
                catch (e) { console.error("JSON Parse Error:", url, e); }
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
                    callback(xhr.responseText ? JSON.parse(xhr.responseText) : { success: true });
                } catch (e) {
                    console.error("JSON Parse Error:", url, e);
                    callback({ success: true });
                }
            } else {
                console.error("POST ERROR:", url, xhr.status);
                callback({ success: false, message: "Request failed" });
            }
        }
    };
    xhr.send(JSON.stringify(data));
}

// ============================================================================
// FETCH REPORT DETAIL
// ============================================================================

function fetchReportDetail() {
    showSkeletonRows(6);

    ajaxGet(API.getReportDetail + "?report_id=" + reportId, function (res) {
        if (!res.success || !res.data) {
            showErrorState(res.message || "Failed to load report");
            return;
        }

        reportData = res.data;
        renderReportHeader(reportData);
        renderTable(reportData.checksheets || []);
        renderActionPanel(reportData.status);
        document.getElementById("exportBtn").disabled = false;
    });
}

// ============================================================================
// RENDER HEADER
// ============================================================================

function renderReportHeader(data) {
    document.getElementById("metaTitle").textContent = data.title || "—";
    document.getElementById("metaPeriod").textContent = data.period || "—";
    document.getElementById("metaPreparedBy").textContent = data.prepared_by || "—";
    document.getElementById("metaTotalRecords").textContent = data.total_records || "—";
    document.getElementById("metaSubmittedAt").textContent =
        data.submitted_at ? timestampToDatetime(data.submitted_at) : "—";

    document.getElementById("reportHeader").style.display = "";
    document.title = "Approval — " + (data.title || "Report");

    // Status badge
    var badge = document.getElementById("statusBadge");
    var status = (data.status || "").toLowerCase();
    badge.textContent = data.status || "";
    badge.className = "status-badge";
    if (status.indexOf("pending") !== -1) badge.classList.add("pending");
    if (status.indexOf("approved") !== -1) badge.classList.add("approved");
    if (status.indexOf("rejected") !== -1) badge.classList.add("rejected");
}

// ============================================================================
// RENDER TABLE
// ============================================================================

function renderTable(rows) {
    var tbody = document.getElementById("tableBody");

    if (!rows.length) {
        tbody.innerHTML =
            '<tr><td colspan="12">' +
            '<div class="empty-state">' +
            '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
            '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 9h6M9 12h6M9 15h4"/>' +
            "</svg>" +
            "<p>No checksheet records found</p>" +
            "<small>This report has no linked checksheet data</small>" +
            "</div></td></tr>";
        return;
    }

    var html = "";
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        html +=
            "<tr>" +
            '<td class="row-num">' + (i + 1) + "</td>" +
            '<td style="font-variant-numeric:tabular-nums;font-size:12px;">' + escHtml(timestampToDate(r.date)) + "</td>" +
            "<td><span class='chip'>" + escHtml(r.inspector_name) + "</span></td>" +
            "<td><strong>" + escHtml(r.location_name) + "</strong></td>" +
            '<td style="font-size:12px;color:#64748b;">' + escHtml(r.area_type) + "</td>" +
            "<td>" + statusPill(r.cleanliness) + "</td>" +
            "<td>" + statusPill(r.equipment) + "</td>" +
            "<td>" + statusPill(r.lightning) + "</td>" +
            "<td>" + statusPill(r.signage) + "</td>" +
            "<td>" + statusPill(r.obstruction) + "</td>" +
            "<td>" +
            (r.attachment
                ? '<a href="' + escHtml(r.attachment) + '" target="_blank" class="attach-icon" title="View">📎</a>'
                : '<span class="no-attach">—</span>') +
            "</td>" +
            '<td class="notes-cell" title="' + escHtml(r.notes) + '">' + (escHtml(r.notes) || "—") + "</td>" +
            "</tr>";
    }
    tbody.innerHTML = html;
}

// ============================================================================
// ACTION PANEL
// ============================================================================

function renderActionPanel(status) {
    var st = (status || "").toLowerCase();

    if (st.indexOf("pending") !== -1) {
        document.getElementById("panelInfo").textContent =
            "Review the records above, then approve or reject this report.";
        document.getElementById("actionPanel").style.display = "";
        return;
    }

    if (st.indexOf("approved") !== -1) {
        showDecidedBanner("approved", "Report Approved",
            "This report has already been approved.");
        return;
    }

    if (st.indexOf("rejected") !== -1) {
        showDecidedBanner("rejected", "Report Rejected",
            "This report has already been rejected." +
            (reportData.rejection_reason ? " Reason: " + reportData.rejection_reason : ""));
        return;
    }
}

// ============================================================================
// APPROVE
// ============================================================================

function handleApprove() {
    if (isDecided) return;
    if (!confirm("Are you sure you want to approve this report?")) return;

    setActionBtnsDisabled(true);

    ajaxPost(API.approveReport, {
        report_id: reportId,
        approved_by: getCurrentUserName(),
    }, function (res) {
        if (res.success) {
            isDecided = true;
            showDecidedBanner("approved", "Report Approved",
                "You have approved this report. The submitter will be notified.");
            updateStatusBadge("approved", "Approved");
            showToast("Report approved successfully!", "success");
        } else {
            showToast("Failed to approve: " + (res.message || "Unknown error"), "error");
            setActionBtnsDisabled(false);
        }
    });
}

// ============================================================================
// REJECT  (two-step: show textarea first, then confirm)
// ============================================================================

function handleReject() {
    if (isDecided) return;

    if (rejectStep === 0) {
        document.getElementById("rejectionWrap").style.display = "";
        document.getElementById("rejectionReason").focus();
        document.getElementById("rejectBtn").innerHTML =
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
            '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
            "</svg> Confirm Reject";
        document.getElementById("panelInfo").textContent = "Enter a reason, then click Confirm Reject.";
        rejectStep = 1;
        return;
    }

    var reason = document.getElementById("rejectionReason").value.trim();
    if (!reason) {
        showToast("Please enter a rejection reason", "error");
        document.getElementById("rejectionReason").focus();
        return;
    }

    setActionBtnsDisabled(true);

    ajaxPost(API.rejectReport, {
        report_id: reportId,
        rejected_by: getCurrentUserName(),
        rejection_reason: reason,
    }, function (res) {
        if (res.success) {
            isDecided = true;
            showDecidedBanner("rejected", "Report Rejected",
                "You have rejected this report. The submitter will be notified.");
            updateStatusBadge("rejected", "Rejected");
            showToast("Report rejected.", "error");
        } else {
            showToast("Failed to reject: " + (res.message || "Unknown error"), "error");
            setActionBtnsDisabled(false);
        }
    });
}

// ============================================================================
// DECIDED BANNER
// ============================================================================

function showDecidedBanner(type, heading, message) {
    document.getElementById("actionPanel").style.display = "none";

    var iconSvg = type === "approved"
        ? '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
        : '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

    var inner = document.getElementById("decidedInner");
    inner.className = "decided-inner " + type + "-state";
    inner.innerHTML =
        '<div class="decided-icon">' + iconSvg + "</div>" +
        "<h2>" + escHtml(heading) + "</h2>" +
        "<p>" + escHtml(message) + "</p>";

    document.getElementById("decidedBanner").style.display = "";

    setTimeout(function () {
        document.getElementById("decidedBanner").style.display = "none";
    }, 4000);
}

function updateStatusBadge(type, label) {
    var badge = document.getElementById("statusBadge");
    badge.className = "status-badge " + type;
    badge.textContent = label;
}

function setActionBtnsDisabled(state) {
    document.getElementById("approveBtn").disabled = state;
    document.getElementById("rejectBtn").disabled = state;
}

// ============================================================================
// EXPORT PDF
// ============================================================================

function exportPDF() {
    if (!reportData) return;

    var data = reportData;
    var rows = data.checksheets || [];
    var title = data.title || "Checksheet Inspection Report";
    var period = data.period || "";
    var prepBy = data.prepared_by || "";

    function sc(v) {
        if (v === "OK") return "ok";
        if (v === "Somewhat OK") return "warn";
        if (v === "Not OK") return "nok";
        return "na";
    }

    var tableRows = "";
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        tableRows +=
            "<tr>" +
            '<td style="color:#94a3b8">' + (i + 1) + "</td>" +
            '<td style="font-variant-numeric:tabular-nums">' + escHtml(timestampToDate(r.date)) + "</td>" +
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

    // Stamp block for approved/rejected state
    var stamp = "";
    var st = (data.status || "").toLowerCase();
    if (st.indexOf("approved") !== -1) {
        stamp = "<div class='stamp approved-stamp'><div class='stamp-lbl'>APPROVED</div>" +
            "<div class='stamp-by'>By: " + escHtml(data.approved_by || "—") + "</div>" +
            (data.approved_at ? "<div class='stamp-at'>" + timestampToDatetime(data.approved_at) + "</div>" : "") +
            "</div>";
    } else if (st.indexOf("rejected") !== -1) {
        stamp = "<div class='stamp rejected-stamp'><div class='stamp-lbl'>REJECTED</div>" +
            "<div class='stamp-by'>By: " + escHtml(data.rejected_by || "—") + "</div>" +
            (data.rejection_reason ? "<div class='stamp-reason'>Reason: " + escHtml(data.rejection_reason) + "</div>" : "") +
            "</div>";
    }

    var win = window.open("", "_blank");
    win.document.write(
        "<!DOCTYPE html><html lang='en'><head>" +
        "<meta charset='UTF-8'/><title>" + escHtml(title) + "</title>" +
        "<link href='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' rel='stylesheet'/>" +
        "<style>" +
        "*{box-sizing:border-box;margin:0;padding:0}" +
        "body{font-family:'Inter',Arial,sans-serif;font-size:11px;color:#272b32;padding:28px 32px}" +
        ".rh{border-bottom:2px solid #4b61dc;padding-bottom:14px;margin-bottom:18px;" +
        "display:flex;justify-content:space-between;align-items:flex-start;gap:20px}" +
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
        ".stamp{padding:8px 14px;border-radius:6px;border:2px solid;text-align:center;flex-shrink:0}" +
        ".approved-stamp{border-color:#16a34a;color:#16a34a}" +
        ".rejected-stamp{border-color:#dc2626;color:#dc2626}" +
        ".stamp-lbl{font-size:13px;font-weight:800;letter-spacing:2px}" +
        ".stamp-by,.stamp-at,.stamp-reason{font-size:10px;margin-top:2px}" +
        ".sigs{margin-top:36px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px}" +
        ".sig{border-top:1px solid #272b32;padding-top:6px}" +
        ".sig-lbl{font-size:10px;color:#64748b;margin-bottom:28px}" +
        ".sig-name{font-size:11px;font-weight:600;border-top:1px solid #ccc;padding-top:4px}" +
        ".foot{margin-top:18px;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;" +
        "padding-top:10px;display:flex;justify-content:space-between}" +
        "@media print{body{padding:0}}" +
        "</style></head><body>" +
        "<div class='rh'>" +
        "<div>" +
        "<h1>" + escHtml(title) + "</h1>" +
        "<div class='meta'>" +
        "<span>Period: <strong>" + escHtml(period) + "</strong></span>" +
        "<span>Prepared by: <strong>" + escHtml(prepBy) + "</strong></span>" +
        "<span>Submitted: <strong>" + (data.submitted_at ? timestampToDatetime(data.submitted_at) : "—") + "</strong></span>" +
        "<span>Records: <strong>" + (data.total_records || rows.length) + "</strong></span>" +
        "</div>" +
        "</div>" +
        stamp +
        "</div>" +
        "<table><thead><tr>" +
        "<th>#</th><th>Date</th><th>Inspector</th><th>Location</th><th>Area</th>" +
        "<th>Cleanliness</th><th>Equipment</th><th>Lightning</th>" +
        "<th>Signage</th><th>Obstruction</th><th>Notes</th>" +
        "</tr></thead><tbody>" + tableRows + "</tbody></table>" +
        "<div class='sigs'>" +
        "<div class='sig'><div class='sig-lbl'>Prepared by</div><div class='sig-name'>" + (escHtml(prepBy) || "&nbsp;") + "</div></div>" +
        "<div class='sig'><div class='sig-lbl'>Reviewed by</div><div class='sig-name'>&nbsp;</div></div>" +
        "<div class='sig'><div class='sig-lbl'>Approved by</div><div class='sig-name'>" + (escHtml(data.approved_by) || "&nbsp;") + "</div></div>" +
        "</div>" +
        "<div class='foot'>" +
        "<span>" + escHtml(title) + " \u2014 Confidential</span>" +
        "<span>Status: " + escHtml(data.status || "—") + "</span>" +
        "</div>" +
        "<script>window.onload=function(){setTimeout(function(){window.print();},400)}<\/script>" +
        "</body></html>"
    );
    win.document.close();
    showToast("PDF print dialog opened", "success");
}

// ============================================================================
// HELPERS
// ============================================================================

function statusPill(val) {
    if (!val || val === "—") return '<span class="pill pill-na"><span class="pill-dot"></span>—</span>';
    if (val === "OK") return '<span class="pill pill-ok"><span class="pill-dot"></span>OK</span>';
    if (val === "Somewhat OK") return '<span class="pill pill-warn"><span class="pill-dot"></span>Somewhat OK</span>';
    return '<span class="pill pill-nok"><span class="pill-dot"></span>Not OK</span>';
}

function escHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function timestampToDate(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    return d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" +
        String(d.getDate()).padStart(2, "0");
}

function timestampToDatetime(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleString("id-ID");
}

function getCurrentUserName() {
    // Officeless passes the logged-in user via URL param.
    // Adjust if your setup exposes the user differently.
    return getParam("user_name") || "Approver";
}

function showSkeletonRows(count) {
    var tbody = document.getElementById("tableBody");
    var html = "";
    for (var i = 0; i < count; i++) {
        html += "<tr>";
        for (var j = 0; j < 12; j++) {
            html += '<td><div class="skeleton" style="width:' + (55 + Math.floor(Math.random() * 35)) + '%"></div></td>';
        }
        html += "</tr>";
    }
    tbody.innerHTML = html;
}

function showErrorState(message) {
    document.getElementById("tableBody").innerHTML =
        '<tr><td colspan="12"><div class="empty-state">' +
        '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
        '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>' +
        '<line x1="12" y1="16" x2="12.01" y2="16"/>' +
        "</svg>" +
        "<p>Could not load report</p>" +
        "<small>" + escHtml(message) + "</small>" +
        "</div></td></tr>";
}

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
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
    }, 3500);
}