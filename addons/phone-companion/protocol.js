//#region src/addons/phone-companion/protocol.ts
const MAX_TEXT_LENGTH = 16e3;
function bounded(value, max) {
	return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= max;
}
function offset(value) {
	return bounded(value, 16e3) && Number.isInteger(value) && value >= 0;
}
function revision(value) {
	return Number.isSafeInteger(value) && value >= 0;
}
function validMotion(value) {
	if (!value || typeof value !== "object") return false;
	const m = value;
	return revision(m.sample) && bounded(m.x, 1.2) && bounded(m.y, 1.2) && bounded(m.scroll, 1e7) && bounded(m.zoom, 1e6);
}
function validMessage(value) {
	if (!value || typeof value !== "object") return false;
	const m = value;
	switch (m.type) {
		case "ping":
		case "bye": return true;
		case "cancel":
		case "center": return m.motion === void 0 || validMotion(m.motion);
		case "button": return typeof m.down === "boolean" && (m.motion === void 0 || validMotion(m.motion));
		case "move": return bounded(m.x, 1) && bounded(m.y, 1);
		case "scroll": return bounded(m.delta, 1e3);
		case "zoom": return bounded(m.factor, 4) && m.factor >= .25;
		case "motion": return validMotion(m.state);
		case "pointer-config": return typeof m.sensitivity === "number" && Number.isFinite(m.sensitivity) && m.sensitivity > 0;
		case "haptic": return bounded(m.duration, 200) && m.duration >= 0;
		case "submit":
		case "done": return revision(m.revision);
		case "open-keyboard": return revision(m.fieldId);
		case "field": {
			if (m.field === null) return true;
			if (!m.field || typeof m.field !== "object") return false;
			const f = m.field;
			return revision(f.id) && revision(f.revision) && typeof f.label === "string" && f.label.length <= 1e3;
		}
		case "edit": return revision(m.revision) && typeof m.value === "string" && m.value.length <= 16e3 && offset(m.start) && offset(m.end) && m.start <= m.end && m.end <= m.value.length;
		case "text": {
			if (m.state === null) return true;
			if (!m.state || typeof m.state !== "object") return false;
			const s = m.state;
			return validMessage({
				...s,
				type: "edit"
			}) && typeof s.label === "string" && s.label.length <= 1e3 && typeof s.multiline === "boolean" && offset(s.maxLength);
		}
		default: return false;
	}
}
/** Allowed inbound direction and per-second budget for each application message. */
const HOST_MESSAGES = {
	ping: 4,
	bye: 2,
	button: 30,
	cancel: 20,
	center: 8,
	motion: 120,
	"open-keyboard": 8,
	edit: 60,
	submit: 8,
	done: 8
};
const PHONE_MESSAGES = {
	ping: 4,
	bye: 2,
	"pointer-config": 4,
	field: 60,
	text: 60,
	haptic: 30
};
//#endregion
export { HOST_MESSAGES, MAX_TEXT_LENGTH, PHONE_MESSAGES, validMessage, validMotion };
