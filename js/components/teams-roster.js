/**
 * Teams page sportscard modal: opens on the player whose "View sportscard"
 * button was clicked, then the arrow buttons (and arrow keys) step through the
 * team's players in an endless loop; on touch the card follows the finger and
 * is swiped away. Cards glide in the direction of travel; the motion itself
 * lives in scss/custom.scss (.sportscard-modal__slide).
 */
(() => {
    "use strict";

    const setup = (modal) => {
        const slides = Array.from(modal.querySelectorAll("[data-sportscard-slide]"));
        if (!slides.length) return;
        let current = 0;

        const track = slides[0].parentElement;
        const LEAVE_MS = 600; // matches --slide-ms in scss/custom.scss
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

        // The card images are lazy-loaded, and a hidden slide never loads on its
        // own, so fetch the cards either side of the current one ahead of time.
        // Otherwise the next card animates in empty and its image pops in late.
        const warm = (index) => {
            [index - 1, index, index + 1].forEach((i) => {
                const slide = slides[(i + slides.length) % slides.length];
                slide.querySelectorAll("img[loading='lazy']").forEach((img) => {
                    img.loading = "eager";
                });
            });
        };

        // direction: "next" | "prev" for the arrows, null to jump with no motion
        const show = (index, direction = null) => {
            // Wrap in both directions so the loop never dead-ends
            const target = (index + slides.length) % slides.length;
            if (target === current && direction) return;
            const leaving = slides[current];
            current = target;
            warm(current);

            // Set the travel direction, then force a reflow so the incoming card
            // starts from the new side rather than sliding across from the old
            // one. A card already on screen (peeking in from a drag, or still
            // sliding out) carries on from where it is instead.
            const incoming = slides[current];
            const snap = getComputedStyle(incoming).visibility === "hidden";
            if (snap) incoming.style.transition = "none";
            if (direction) track.dataset.direction = direction;
            void track.offsetWidth;
            if (snap) incoming.style.transition = "";

            slides.forEach((slide, i) => {
                slide.classList.toggle("is-active", i === current);
                slide.classList.remove("is-leaving");
            });
            if (direction && leaving !== slides[current]) {
                leaving.classList.add("is-leaving");
                window.setTimeout(() => leaving.classList.remove("is-leaving"), LEAVE_MS);
            }
        };

        // Bootstrap passes the triggering element, which carries the player's index
        modal.addEventListener("show.bs.modal", (event) => {
            const trigger = event.relatedTarget;
            const index = trigger ? parseInt(trigger.dataset.playerIndex, 10) : 0;
            show(Number.isNaN(index) ? 0 : index);
            warm(current); // show() skips its own warm-up when reopening on the same card
        });

        const prev = modal.querySelector("[data-sportscard-prev]");
        const next = modal.querySelector("[data-sportscard-next]");
        if (prev) prev.addEventListener("click", () => show(current - 1, "prev"));
        if (next) next.addEventListener("click", () => show(current + 1, "next"));

        // Touch swipe: the card follows the finger with the neighbour it's heading
        // for peeking in beside it, like a carousel strip. A mostly-horizontal
        // drag of 40px+, or a quick flick, carries on to that card from wherever
        // it was let go; anything less springs back.
        const SWIPE_MIN = 40;
        const FLICK_MIN = 0.4; // px per ms
        let touchStartX = 0;
        let touchStartY = 0;
        let touchStartTime = 0;
        let dragging = false; // horizontal drag under way
        let locked = false;   // gesture decided (drag or vertical scroll)

        const release = () => {
            track.classList.remove("is-dragging");
            slides.forEach((slide) => {
                slide.classList.remove("is-peeking");
                slide.style.transform = "";
            });
        };

        track.addEventListener("touchstart", (event) => {
            touchStartX = event.changedTouches[0].clientX;
            touchStartY = event.changedTouches[0].clientY;
            touchStartTime = event.timeStamp;
            dragging = false;
            locked = false;
        }, { passive: true });
        track.addEventListener("touchmove", (event) => {
            if (reduceMotion.matches) return;
            const deltaX = event.changedTouches[0].clientX - touchStartX;
            const deltaY = event.changedTouches[0].clientY - touchStartY;
            // Decide once, after a few pixels, whether this is a sideways drag
            if (!locked) {
                if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) return;
                locked = true;
                dragging = Math.abs(deltaX) > Math.abs(deltaY);
                if (dragging) track.classList.add("is-dragging");
            }
            if (!dragging) return;

            // Dragging left brings in the next card from the right, and vice versa.
            // The direction is set now so a spring-back returns it to that side.
            const direction = deltaX < 0 ? "next" : "prev";
            const neighbour = slides[(current + (deltaX < 0 ? 1 : -1) + slides.length) % slides.length];
            track.dataset.direction = direction;
            slides.forEach((slide) => {
                if (slide !== slides[current] && slide !== neighbour) {
                    slide.classList.remove("is-peeking");
                    slide.style.transform = "";
                }
            });
            slides[current].style.transform = `translateX(${deltaX}px)`;
            if (neighbour !== slides[current]) {
                neighbour.classList.add("is-peeking");
                neighbour.style.transform = `translateX(calc(${deltaX < 0 ? 100 : -100}% + ${deltaX}px))`;
            }
        }, { passive: true });
        track.addEventListener("touchend", (event) => {
            const deltaX = event.changedTouches[0].clientX - touchStartX;
            const deltaY = event.changedTouches[0].clientY - touchStartY;
            const speed = Math.abs(deltaX) / Math.max(1, event.timeStamp - touchStartTime);
            const wasDragging = dragging;
            dragging = false;
            const sideways = wasDragging || Math.abs(deltaX) >= Math.abs(deltaY);
            const farEnough = Math.abs(deltaX) >= SWIPE_MIN || (speed >= FLICK_MIN && Math.abs(deltaX) >= 12);
            // Hand the cards back to CSS in the same frame as the class change, so
            // they animate on from where the finger left them instead of jumping
            release();
            if (!sideways || !farEnough) return;
            // Dragging left pulls the next card in from the right, and vice versa
            if (deltaX < 0) show(current + 1, "next");
            else show(current - 1, "prev");
        }, { passive: true });
        track.addEventListener("touchcancel", () => {
            dragging = false;
            release();
        }, { passive: true });

        modal.addEventListener("keydown", (event) => {
            if (event.key === "ArrowLeft") show(current - 1, "prev");
            if (event.key === "ArrowRight") show(current + 1, "next");
        });
    };

    const initialize = () => {
        document.querySelectorAll("[data-sportscard-modal]").forEach((modal) => {
            if (!modal.dataset.sportscardReady) {
                modal.dataset.sportscardReady = "true";
                setup(modal);
            }
        });
    };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
