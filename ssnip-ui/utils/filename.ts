export function formatFilename(template: string, ext: string, now = new Date()): string {
  const parts = {
    yyyy: now.getFullYear().toString(),
    MM: (now.getMonth() + 1).toString().padStart(2, "0"),
    dd: now.getDate().toString().padStart(2, "0"),
    HH: now.getHours().toString().padStart(2, "0"),
    mm: now.getMinutes().toString().padStart(2, "0"),
    ss: now.getSeconds().toString().padStart(2, "0"),
  };

  return `${template.replace(/\{(yyyy|MM|dd|HH|mm|ss)\}/g, (_, key: keyof typeof parts) => parts[key])}.${ext}`;
}
