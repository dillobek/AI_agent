/**
 * Smart natural sorting for file/document names that share a base name but
 * differ by a trailing number or date, e.g.:
 *   "Xaydarov Saydullo 1", "Xaydarov Saydullo 2", "Xaydarov Saydullo 4"
 * Returns items sorted with the "latest" (highest trailing number, or most
 * recent modifiedTime as a tiebreaker) first.
 */
export interface NaturallySortable {
  name: string;
  modifiedTime?: string | Date;
}

export function naturalSortByNameDesc<T extends NaturallySortable>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const nameCompare = b.name.localeCompare(a.name, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
    if (nameCompare !== 0) return nameCompare;

    const aTime = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0;
    const bTime = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0;
    return bTime - aTime;
  });
}

/** Extracts a trailing integer from a name, e.g. "Doc 4" -> 4, "Doc" -> 0 */
export function trailingNumber(name: string): number {
  const match = name.match(/(\d+)\s*$/);
  return match ? parseInt(match[1], 10) : 0;
}
