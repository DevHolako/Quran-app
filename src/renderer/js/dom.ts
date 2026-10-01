/**
 * Escaping helpers for the places where the app builds HTML by hand.
 *
 * A lot of this UI is assembled with template literals assigned to `innerHTML`, because
 * it is full of lucide icons and inline `onclick` wiring. That makes every value that
 * gets interpolated a potential injection point, and several of them are not even local:
 * `verse.text` and the tafsir come from a remote API, `info.changelog` from a remote
 * manifest, and `item.text` / `surahName` can come from an imported backup file.
 *
 * Markup the app itself owns (icons, class names, layout) can stay as-is. Anything that
 * originates outside the bundle has to go through escapeHtml() first.
 */

const HTML_ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#96;'
};

/** Escapes text for interpolation into an HTML text node or a quoted attribute. */
export function escapeHtml(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value).replace(/[&<>"'`]/g, (char) => HTML_ESCAPES[char]);
}

/**
 * Coerces an imported or stored value to a safe integer. Used for anything interpolated
 * into an `onclick="fn(1, 2)"` argument list, where a non-numeric value could close the
 * attribute and append a second handler.
 */
export function toSafeIndex(value: unknown, min: number, max: number, fallback: number = 0): number {
    const parsed = typeof value === 'number' ? value : parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    const rounded = Math.trunc(parsed);
    if (rounded < min) return min;
    if (rounded > max) return max;
    return rounded;
}

/**
 * Sets element content from an untrusted string while keeping the wrapper element that
 * carries the styling. Assigning to innerHTML here would reintroduce the exact sink this
 * helper exists to close.
 */
export function setTextContentPreservingWrapper(el: HTMLElement, wrapperClass: string, text: string): void {
    const wrapper = document.createElement('div');
    wrapper.className = wrapperClass;
    wrapper.textContent = text;
    el.replaceChildren(wrapper);
}
