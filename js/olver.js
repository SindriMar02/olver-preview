/* Ölver content wiring only. Reykjavík uses UTC throughout the year. */
(() => {
    "use strict";

    const openDot = document.querySelector("[data-open-now]");
    const updateHours = () => {
        if (!openDot) return;
        const now = new Date();
        const day = now.getUTCDay();
        const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
        // Thursday, Friday and Saturday service ends at 01:00 the following day.
        const afterMidnight = minutes < 60 && [0, 5, 6].includes(day);
        const open = minutes >= 12 * 60 || afterMidnight;
        openDot.dataset.openNow = open ? "1" : "0";
        openDot.closest("a").setAttribute("aria-label",
            `Leikjaskráin, ${open ? "opið núna" : "lokað núna"}`);
    };
    updateHours();
    window.setInterval(updateHours, 60000);

    const video = document.querySelector(".hero-banner__video");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (video) {
        const source = video.getAttribute("src");
        const poster = video.getAttribute("poster");
        const updateVideo = () => {
            if (reducedMotion.matches) {
                video.pause();
                video.autoplay = false;
                video.poster = "assets/pour-end.webp";
                // Reset the media to display the poster even after playback has begun.
                video.removeAttribute("src");
                video.load();
            } else if (!video.getAttribute("src")) {
                video.poster = poster;
                video.src = source;
                video.autoplay = true;
                video.load();
                const attempt = video.play();
                if (attempt) attempt.catch(() => {});
            }
        };
        updateVideo();
        reducedMotion.addEventListener("change", updateVideo);
    }

    const card = document.querySelector(".hero-modal-section");
    const teams = document.querySelector("#home-teams");
    let fixtureDays;
    // One selection for both surfaces: today's last match, otherwise next day's first.
    const selectMainMatch = (days, today) => {
        const day = days.filter(day => day.date >= today && day.matches.length)
            .sort((a, b) => a.date.localeCompare(b.date))[0];
        if (!day) return null;
        const matches = [...day.matches].sort((a, b) => a.time.localeCompare(b.time));
        return { day, match: day.date === today ? matches[matches.length - 1] : matches[0] };
    };
    const updateMatch = () => {
        if (!fixtureDays) return;
        const today = new Date().toISOString().slice(0, 10);
        const selected = selectMainMatch(fixtureDays, today);
        // Own list: browsers without Icelandic locale data fall back to English ("Thursday").
        const DAYS = ["sunnudagur", "mánudagur", "þriðjudagur", "miðvikudagur", "fimmtudagur", "föstudagur", "laugardagur"];
        const weekday = selected ? DAYS[new Date(`${selected.day.date}T12:00:00Z`).getUTCDay()] : "";
        if (teams) {
            const home = teams.querySelector(".home-teams__team--llamas");
            const away = teams.querySelector(".home-teams__team--chaos");
            home.querySelector(".home-teams__team-title").textContent = selected ? selected.match.home : "Næstu leikir";
            away.querySelector(".home-teams__team-title").textContent = selected ? selected.match.away : "Leikjaskrá";
            home.querySelector(".home-teams__team-text p").textContent = selected
                ? `Heimalið. ${weekday.charAt(0).toUpperCase() + weekday.slice(1)} kl. ${selected.match.time}` : "Sjá leikjaskrá vikunnar";
            away.querySelector(".home-teams__team-text p").textContent = selected
                ? `Gestirnir. ${selected.match.comp}, í beinni á Ölver` : "Sjá leikjaskrá vikunnar";
        }
        if (!card) return;
        const pretitle = card.querySelector(".modal-pre-title");
        const title = card.querySelector(".modal-section-title");
        const link = card.querySelector(".hero-video-trigger");
        if (!selected) {
            pretitle.textContent = "Næstu leikir";
            title.replaceChildren("Sjá ", document.createElement("br"), "leikjaskrá");
            link.setAttribute("aria-label", "Sjá leikjaskrá");
            return;
        }
        const { day, match } = selected;
        pretitle.textContent = day.date === today ? `${match.time} í kvöld · ${match.comp || match.sport || "í beinni"}` : `Næsti leikur: ${weekday}`;
        title.replaceChildren(`${match.home} `, document.createElement("br"), `gegn ${match.away}`);
        link.setAttribute("aria-label", `${match.time} ${match.home} gegn ${match.away}, ${match.comp}`);
    };
    if (card || teams) {
        fetch("data/fixtures.json")
            .then(response => {
                if (!response.ok) throw new Error("Fixture request failed");
                return response.json();
            })
            .then(data => {
                if (!Array.isArray(data.days) || !data.days.every(day =>
                    /^\d{4}-\d{2}-\d{2}$/.test(day.date) && Array.isArray(day.matches) &&
                    day.matches.every(match => /^\d{2}:\d{2}$/.test(match.time) &&
                        [match.home, match.away, match.comp].every(value => typeof value === "string")))) {
                    throw new Error("Invalid fixture data");
                }
                fixtureDays = data.days;
                updateMatch();
            })
            .catch(() => { /* Keep the HTML fallback if the feed is unavailable. */ });
        window.setInterval(updateMatch, 60000);
    }
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            updateHours();
            updateMatch();
        }
    });
})();

// Claude: Boom Ball's burger and close control are <div>s; give them keyboard use and return
// focus to the burger when the menu closes (Bootstrap leaves it on <body>).
(() => {
    const menu = document.getElementById("offcanvasMenu");
    const burger = document.getElementById("offcanvas-button");
    if (!menu || !burger) return;
    document.querySelectorAll("#offcanvas-button, .close-menu").forEach((control) => {
        control.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            control.click();
        });
    });
    menu.addEventListener("shown.bs.offcanvas", () => burger.setAttribute("aria-expanded", "true"));
    // In-page links (Salir, Heimsókn) must close the drawer; Bootstrap only closes on its dismiss control.
    menu.addEventListener("click", (event) => {
        const link = event.target.closest('a[href^="#"]');
        if (link && window.bootstrap) window.bootstrap.Offcanvas.getOrCreateInstance(menu).hide();
    });
    menu.addEventListener("hidden.bs.offcanvas", () => {
        burger.setAttribute("aria-expanded", "false");
        if (!document.activeElement || document.activeElement === document.body) burger.focus({ preventScroll: true });
    });
})();
