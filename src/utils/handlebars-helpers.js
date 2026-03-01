import expressHandlebarsSections from "express-handlebars-sections";

/**
 * Core helper function for formatting dates
 * Applies DRY principle by centralizing date formatting logic
 * @param {Date|string} date - The date to format
 * @param {string} format - The format type: 'full', 'date', 'time', 'input'
 * @returns {string} Formatted date string
 */
function formatDateHelper(date, format = "full") {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const minute = String(d.getMinutes()).padStart(2, "0");
  const second = String(d.getSeconds()).padStart(2, "0");

  switch (format) {
    case "full":
      return `${hour}:${minute}:${second} ${day}/${month}/${year}`;
    case "date":
      return `${day}/${month}/${year}`;
    case "time":
      return `${hour}:${minute}:${second}`;
    case "input":
      return `${year}-${month}-${day}`;
    default:
      return `${hour}:${minute}:${second} ${day}/${month}/${year}`;
  }
}

/**
 * Calculate time remaining from now to a future date
 * @param {Date|string} date - The target date
 * @returns {Object} Object containing days, hours, minutes, seconds
 */
function calculateTimeRemaining(date) {
  const now = new Date();
  const end = new Date(date);
  const diff = end - now;

  if (diff <= 0) {
    return { diff: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  return {
    diff,
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
  };
}

/**
 * Handlebars Helpers Object
 * Organized by category for better maintainability
 */
export default {
  // ============================================================
  // SECTION HELPER
  // ============================================================
  section: expressHandlebarsSections(),

  // ============================================================
  // COMPARISON HELPERS
  // ============================================================
  eq(a, b) {
    return a === b;
  },
  ne(a, b) {
    return a !== b;
  },
  gt(a, b) {
    return a > b;
  },
  gte(a, b) {
    return a >= b;
  },
  lt(a, b) {
    return a < b;
  },
  lte(a, b) {
    return a <= b;
  },
  and(...args) {
    return args.slice(0, -1).every(Boolean);
  },
  or(...args) {
    return args.slice(0, -1).some(Boolean);
  },

  // ============================================================
  // MATH HELPERS
  // ============================================================
  add(a, b) {
    return a + b;
  },
  subtract(a, b) {
    return a - b;
  },
  multiply(a, b) {
    return a * b;
  },
  round(value, decimals) {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  },

  // ============================================================
  // STRING HELPERS
  // ============================================================
  truncate(str, len) {
    if (!str) return "";
    if (str.length <= len) return str;
    return str.substring(0, len) + "...";
  },

  replace(str, search, replaceWith) {
    if (!str) return "";
    return str.replace(new RegExp(search, "g"), replaceWith);
  },

  mask_name(fullname) {
    if (!fullname) return null;
    const name = fullname.trim();
    if (name.length === 0) return null;
    if (name.length === 1) return "*";
    if (name.length === 2) return name[0] + "*";

    // Mã hóa xen kẽ: giữ ký tự ở vị trí chẵn (0,2,4...), thay bằng * ở vị trí lẻ (1,3,5...)
    let masked = "";
    for (let i = 0; i < name.length; i++) {
      masked += i % 2 === 0 ? name[i] : "*";
    }
    return masked;
  },

  // ============================================================
  // NUMBER HELPERS
  // ============================================================
  format_number(price) {
    return new Intl.NumberFormat("en-US").format(price);
  },

  // ============================================================
  // DATE/TIME HELPERS (Using DRY principle)
  // ============================================================
  format_date(date) {
    return formatDateHelper(date, "full");
  },

  format_only_date(date) {
    return formatDateHelper(date, "date");
  },

  format_only_time(date) {
    return formatDateHelper(date, "time");
  },

  format_date_input(date) {
    return formatDateHelper(date, "input");
  },

  time_remaining(date) {
    const { diff, hours, minutes, seconds } = calculateTimeRemaining(date);
    if (diff <= 0) return "00:00:00";

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  },

  format_time_remaining(date) {
    const end = new Date(date);
    const { diff, days, hours, minutes, seconds } = calculateTimeRemaining(date);

    if (diff <= 0) return "Auction Ended";

    // > 3 ngày: hiển thị ngày kết thúc
    if (days > 3) {
      return formatDateHelper(end, "full");
    }

    // <= 3 ngày: hiển thị ... days left
    if (days >= 1) {
      return `${days} days left`;
    }

    // < 1 ngày: hiển thị ... hours left
    if (hours >= 1) {
      return `${hours} hours left`;
    }

    // < 1 giờ: hiển thị ... minutes left
    if (minutes >= 1) {
      return `${minutes} minutes left`;
    }

    // < 1 phút: hiển thị ... seconds left
    return `${seconds} seconds left`;
  },

  should_show_relative_time(date) {
    const { diff, days } = calculateTimeRemaining(date);
    if (diff <= 0) return true;
    return days <= 3;
  },

  // ============================================================
  // PAGINATION HELPERS
  // ============================================================
  getPaginationRange(currentPage, totalPages) {
    const range = [];
    const maxVisible = 4;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        range.push({ number: i, type: "number" });
      }
    } else {
      range.push({ number: 1, type: "number" });

      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);

      if (start > 2) range.push({ type: "ellipsis" });

      for (let i = start; i <= end; i++) {
        range.push({ number: i, type: "number" });
      }

      if (end < totalPages - 1) range.push({ type: "ellipsis" });

      range.push({ number: totalPages, type: "number" });
    }

    return range;
  },

  // ============================================================
  // ARRAY HELPERS
  // ============================================================
  range(start, end) {
    const result = [];
    for (let i = start; i < end; i++) {
      result.push(i);
    }
    return result;
  },

  length(arr) {
    return Array.isArray(arr) ? arr.length : 0;
  },
};
