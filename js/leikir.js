/* Fixture content only. Reykjavík uses UTC throughout the year. */
(() => {
    "use strict";
    const container = document.querySelector("#olver-fixtures");
    if (!container) return;
    // Same explicit Icelandic weekday list as olver.js; no locale fallback.
    const DAYS = ["sunnudagur", "mánudagur", "þriðjudagur", "miðvikudagur", "fimmtudagur", "föstudagur", "laugardagur"];
    const MONTHS = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"];
    const clean = value => String(value ?? "").replace(/\s*[\u2013\u2014]\s*/g, ": ");
    const dateLabel = (date, today, first) => {
        const day = new Date(`${date}T12:00:00Z`);
        const weekday = DAYS[day.getUTCDay()];
        return [first && date === today ? "Í dag" : weekday.charAt(0).toUpperCase() + weekday.slice(1),
            `${day.getUTCDate()}. ${MONTHS[day.getUTCMonth()]}`];
    };
    const valid = data => Array.isArray(data?.days) && data.days.every(day =>
        /^\d{4}-\d{2}-\d{2}$/.test(day.date) &&
        !Number.isNaN(Date.parse(`${day.date}T12:00:00Z`)) &&
        new Date(`${day.date}T12:00:00Z`).toISOString().slice(0, 10) === day.date &&
        Array.isArray(day.matches) && day.matches.every(match =>
            /^([01]\d|2[0-3]):[0-5]\d$/.test(match.time) &&
            [match.home, match.away, match.sport].every(value => typeof value === "string") &&
            (match.comp == null || typeof match.comp === "string")));
    const upcoming = (days, today) => days.filter(day => day.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date));
    // Capture pristine source markup before the reveal component initializes.
    const sectionTemplate = container.querySelector(".team-roster").cloneNode(true);
    const rowTemplate = sectionTemplate.querySelector(".team-roster__player").cloneNode(true);
    let days = Array.from(container.querySelectorAll("[data-fixture-date]")).map(section => ({
        date: section.dataset.fixtureDate,
        matches: Array.from(section.querySelectorAll(".team-roster__player")).map(row => {
            const [home, away] = row.querySelector(".team-roster__name").textContent.split(" gegn ");
            return { time: row.querySelector(".olver-time").textContent, home, away,
                comp: row.querySelector(".team-roster__meta--position").textContent,
                sport: row.querySelector(".team-roster__meta--hometown").textContent };
        })
    }));
    let renderedDate;
    const render = (force = false) => {
        const today = new Date().toISOString().slice(0, 10);
        if (!force && renderedDate === today) return;
        renderedDate = today;
        const fragment = document.createDocumentFragment();
        upcoming(days, today).forEach((day, index) => {
            const section = sectionTemplate.cloneNode(true);
            section.className = `team-roster team-roster--${index % 2 ? "chaos" : "llamas"}`;
            section.dataset.fixtureDate = day.date;
            const [weekday, date] = dateLabel(day.date, today, index === 0);
            const dateSpan = document.createElement("span");
            dateSpan.textContent = date;
            section.querySelector(".olver-day").replaceChildren(weekday, document.createElement("br"), dateSpan);
            section.querySelector(".team-roster__copy p").textContent = `${day.matches.length} ${day.matches.length === 1 ? "leikur" : "leikir"}`;
            const list = section.querySelector(".team-roster__list");
            list.replaceChildren();
            [...day.matches].sort((a, b) => a.time.localeCompare(b.time)).forEach(match => {
                const row = rowTemplate.cloneNode(true);
                // textContent escapes all feed text; no feed values enter HTML or attributes.
                row.querySelector(".olver-time").textContent = clean(match.time);
                row.querySelector(".team-roster__name").textContent = clean(`${match.home} gegn ${match.away}`);
                row.querySelector(".team-roster__meta--position").textContent = match.comp === match.sport ? "" : clean(match.comp);  // Claude: "Körfubolti" twice otherwise
                row.querySelector(".team-roster__meta--hometown").textContent = clean(match.sport);
                list.append(row);
            });
            fragment.append(section);
        });
        if (!fragment.childNodes.length) {
            const section = sectionTemplate.cloneNode(true);
            section.removeAttribute("data-fixture-date");
            section.querySelector(".olver-day").textContent = "Næstu leikir";
            section.querySelector(".team-roster__copy p").textContent = "Engir leikir eru á dagskránni. Hafðu samband ef þú saknar leiks.";
            section.querySelector(".team-roster__list").replaceChildren();
            fragment.append(section);
        }
        // Claude: a refresh must not drop keyboard focus (e.g. on "Spyrja um leik").
        const focusables = () => [...container.querySelectorAll("a, button, [tabindex]")];
        const focusIndex = container.contains(document.activeElement) ? focusables().indexOf(document.activeElement) : -1;
        container.replaceChildren(fragment);
        if (focusIndex > -1) (focusables()[focusIndex] || container).focus({ preventScroll: true });
        document.dispatchEvent(new Event("reveal:refresh"));
        if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    };
    render();
    fetch("data/fixtures.json")
        .then(response => {
            if (!response.ok) throw new Error("Fixture request failed");
            return response.json();
        })
        .then(data => {
            if (!valid(data)) throw new Error("Invalid fixture data");
            days = data.days;
            render(true);
        })
        .catch(() => { /* Retain the date-filtered static fallback. */ });
    window.setInterval(render, 60000);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) render();
    });
})();
