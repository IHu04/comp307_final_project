// ============================================
// CALENDAR EXPORT FEATURE
// Converts appointments to ICS files for Google/Outlook Calendar
// ============================================

/**
 * Format a JavaScript Date object to ICS-compatible datetime string
 * Uses local time (floating time) - calendars will interpret in user's local timezone
 * 
 * @param {Date} date - JavaScript Date object
 * @returns {string} ICS formatted date string (YYYYMMDDTHHMMSS)
 */
function formatDateToICS(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    // No trailing Z - emits local (floating) time
    // iCal clients will interpret this in the user's local timezone
    return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

/**
 * Generate a complete RFC 5545-compliant ICS calendar file for a single appointment
 * 
 * @param {Object} appointment - Appointment object with the following properties:
 *   @param {string|number} appointment.id - Unique identifier for the appointment
 *   @param {Date} appointment.start - Start date/time of the appointment
 *   @param {Date} appointment.end - End date/time of the appointment
 *   @param {string} appointment.title - Summary/title of the appointment
 *   @param {string} [appointment.description] - Optional description of the appointment
 *   @param {string} [appointment.location] - Optional location of the appointment
 *   @param {string} [appointment.organizer] - Optional organizer name/email
 *   @param {string[]} [appointment.attendees] - Optional list of attendee emails
 * @returns {string} Complete ICS file content as a string
 */
function generateICS(appointment) {
    // DTSTAMP = when this ICS file was generated (current time)
    // DTSTART = when the appointment actually starts
    const stamp = formatDateToICS(new Date());
    const start = formatDateToICS(appointment.start);
    const end = formatDateToICS(appointment.end);
    
    // Escape special characters in text fields
    const escapeText = (text) => {
        if (!text) return '';
        return String(text)
            .replace(/\\/g, '\\\\')
            .replace(/;/g, '\\;')
            .replace(/,/g, '\\,')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '');
    };
    
    const title = escapeText(appointment.title || 'McGill Booking');
    const description = escapeText(appointment.description || 'Appointment booked through McGill Bookings');
    const location = escapeText(appointment.location || 'McGill University');
    
    // Build the ICS content
    // ICS spec: NO leading whitespace on any line
    let ics = `BEGIN:VCALENDAR\r\n`;
    ics += `VERSION:2.0\r\n`;
    ics += `PRODID:-//McGill Bookings//EN\r\n`;
    ics += `CALSCALE:GREGORIAN\r\n`;
    ics += `METHOD:PUBLISH\r\n`;
    ics += `BEGIN:VEVENT\r\n`;
    ics += `UID:${appointment.id}@mcgill-bookings\r\n`;
    ics += `DTSTAMP:${stamp}\r\n`;
    ics += `DTSTART:${start}\r\n`;
    ics += `DTEND:${end}\r\n`;
    ics += `SUMMARY:${title}\r\n`;
    ics += `DESCRIPTION:${description}\r\n`;
    ics += `LOCATION:${location}\r\n`;
    
    // Add organizer if provided
    if (appointment.organizer) {
        ics += `ORGANIZER:${escapeText(appointment.organizer)}\r\n`;
    }
    
    // Add attendees if provided
    if (appointment.attendees && appointment.attendees.length > 0) {
        appointment.attendees.forEach(attendee => {
            ics += `ATTENDEE:${escapeText(attendee)}\r\n`;
        });
    }
    
    ics += `END:VEVENT\r\n`;
    ics += `END:VCALENDAR`;
    
    return ics;
}

/**
 * Generate an ICS file for multiple appointments (single calendar with multiple events)
 * 
 * @param {Array} appointments - Array of appointment objects
 * @returns {string} Complete ICS file content with multiple VEVENTs
 */
function generateMultiICS(appointments) {
    if (!appointments || appointments.length === 0) {
        throw new Error('No appointments provided');
    }
    
    let ics = `BEGIN:VCALENDAR\r\n`;
    ics += `VERSION:2.0\r\n`;
    ics += `PRODID:-//McGill Bookings//EN\r\n`;
    ics += `CALSCALE:GREGORIAN\r\n`;
    ics += `METHOD:PUBLISH\r\n`;
    
    appointments.forEach(appointment => {
        const stamp = formatDateToICS(new Date());
        const start = formatDateToICS(appointment.start);
        const end = formatDateToICS(appointment.end);
        
        const escapeText = (text) => {
            if (!text) return '';
            return String(text)
                .replace(/\\/g, '\\\\')
                .replace(/;/g, '\\;')
                .replace(/,/g, '\\,')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '');
        };
        
        const title = escapeText(appointment.title || 'McGill Booking');
        const description = escapeText(appointment.description || 'Appointment booked through McGill Bookings');
        const location = escapeText(appointment.location || 'McGill University');
        
        ics += `BEGIN:VEVENT\r\n`;
        ics += `UID:${appointment.id}@mcgill-bookings\r\n`;
        ics += `DTSTAMP:${stamp}\r\n`;
        ics += `DTSTART:${start}\r\n`;
        ics += `DTEND:${end}\r\n`;
        ics += `SUMMARY:${title}\r\n`;
        ics += `DESCRIPTION:${description}\r\n`;
        ics += `LOCATION:${location}\r\n`;
        ics += `END:VEVENT\r\n`;
    });
    
    ics += `END:VCALENDAR`;
    return ics;
}

/**
 * Trigger a browser download of an ICS file for a single appointment
 * 
 * @param {Object} appointment - Appointment object (same as generateICS)
 */
function downloadICS(appointment) {
    if (!appointment || !appointment.start || !appointment.end) {
        console.error('Invalid appointment data:', appointment);
        alert('Cannot export: Missing appointment data');
        return;
    }
    
    try {
        const icsContent = generateICS(appointment);
        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `mcgill-booking-${appointment.id}.ics`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
        
        // Optional: Show success message
        console.log(`✓ Calendar file downloaded for booking ${appointment.id}`);
    } catch (error) {
        console.error('Error generating calendar file:', error);
        alert('Error generating calendar file. Please try again.');
    }
}

/**
 * Trigger a browser download of an ICS file for multiple appointments
 * 
 * @param {Array} appointments - Array of appointment objects
 * @param {string} filename - Optional custom filename (default: 'mcgill-bookings')
 */
function downloadMultiICS(appointments, filename = 'mcgill-bookings') {
    if (!appointments || appointments.length === 0) {
        alert('No appointments to export');
        return;
    }
    
    try {
        const icsContent = generateMultiICS(appointments);
        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}-${appointments.length}-events.ics`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
        
        console.log(`✓ Calendar file downloaded with ${appointments.length} events`);
    } catch (error) {
        console.error('Error generating calendar file:', error);
        alert('Error generating calendar file. Please try again.');
    }
}

/**
 * Helper function to create an appointment object from a booking
 * 
 * @param {Object} booking - Booking object from the API
 * @param {string} otherPartyName - Name of the other person (professor or student)
 * @returns {Object} Formatted appointment object for calendar export
 */
function bookingToAppointment(booking, otherPartyName) {
    return {
        id: booking.slotId || booking.id,
        start: new Date(`${booking.date}T${booking.startTime || booking.time?.split('-')[0]?.trim()}`),
        end: new Date(`${booking.date}T${booking.endTime || booking.time?.split('-')[1]?.trim()}`),
        title: `Meeting with ${otherPartyName || 'McGill Contact'}`,
        description: `Appointment booked through McGill Bookings.\nDate: ${booking.date}\nTime: ${booking.startTime || booking.time}`,
        location: booking.location || 'McGill University'
    };
}

/**
 * Helper function to create an appointment object for owner's booked slot
 * 
 * @param {Object} slot - Slot object with booker information
 * @returns {Object} Formatted appointment object for calendar export
 */
function slotToAppointment(slot) {
    const studentName = slot.booker ? `${slot.booker.firstName} ${slot.booker.lastName}` : 'Student';
    return {
        id: slot.id,
        start: new Date(`${slot.date}T${slot.startTime}`),
        end: new Date(`${slot.date}T${slot.endTime}`),
        title: `Meeting with ${studentName}`,
        description: `Student meeting\nCourse: ${slot.courseCode || 'N/A'}\nStudent Email: ${slot.booker?.email || 'N/A'}`,
        location: slot.location || 'McGill University'
    };
}

// Export functions for use in other files (if using modules)
// For regular script tags, these are available globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatDateToICS,
        generateICS,
        generateMultiICS,
        downloadICS,
        downloadMultiICS,
        bookingToAppointment,
        slotToAppointment
    };
}