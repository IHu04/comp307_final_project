// Calendar Export Feature
// Zoe Droulias

// take JS Date obj, return ICS-formatted datetime string (local time, no UTC conversion)
function formatDateToICS(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');

    // no trailing Z — we emit local (floating) time, which iCal clients
    // will interpret in the user's local zone. the backend's ICS export
    // (dashboardController.js) handles timezone-aware exports via ical-generator;
    // this client-side helper is used for preview / download-without-login flows.
    return `${y}${m}${d}T${h}${mi}${s}`;
}

// generate a minimal RFC 5545-compliant ICS string for a single appointment.
// appointment fields:
//   id        – unique identifier string (e.g. slot id from the API)
//   start     – JS Date for appointment start
//   end       – JS Date for appointment end
//   title     – summary string (e.g. "Office Hours - Prof. Smith")
//   description – optional string
function generateICS(appointment) {
    // DTSTAMP = when this ICS file was generated (now)
    // DTSTART = when the appointment actually starts
    const stamp = formatDateToICS(new Date());
    const start = formatDateToICS(appointment.start);
    const end   = formatDateToICS(appointment.end);

    // ICS spec: NO leading whitespace on any line (not even one space)
    const invite =
`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//McGill Bookings//EN\r\nBEGIN:VEVENT\r\nUID:${appointment.id}@mcgill-bookings\r\nDTSTAMP:${stamp}\r\nDTSTART:${start}\r\nDTEND:${end}\r\nSUMMARY:${appointment.title}\r\nDESCRIPTION:${appointment.description || ''}\r\nEND:VEVENT\r\nEND:VCALENDAR`;

    return invite;
}

// trigger a browser download of the ICS file for a given appointment object
function downloadICS(appointment) {
    const icsContent = generateICS(appointment);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url  = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href     = url;
    a.download = `mcgill-booking-${appointment.id}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
