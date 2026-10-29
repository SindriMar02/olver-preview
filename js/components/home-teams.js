/**
 * "Meet the Teams" motion, built from the designer's Jitter sequence
 * (jitter/Meet-teams.json, 60fps / 4s):
 *
 *   0.00s  photo fades in while rising and easing back from 110% to 100%
 *   0.74s  title words drop in one at a time through a line-box mask,
 *          overshooting slightly before they settle
 *   0.90s  Llamas card fades up; VS badge pops on and shrinks from 120%
 *   1.14s  Chaos card fades up
 *   1.33s  button pops on and shrinks from 120%
 *
 * The hero then keeps a scroll parallax: the photo lags the scroll and the
 * title runs ahead of it. Entrance tweens y/scale on the photo and yPercent on
 * the word spans; parallax tweens yPercent on the photo and title, so the two
 * never write the same property on the same element.
 */
(() => {
    "use strict";

    const motion = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    if (!motion || !ScrollTrigger) return;
    motion.registerPlugin(ScrollTrigger);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    // Scroll drift, as a percentage of each layer's own height (+/- half each way).
    const IMAGE_DRIFT = 14;
    const TITLE_DRIFT = -38;

    // Designer's timings (seconds). Words are staggered from WORDS_START; the
    // matchup starts at MATCHUP_START, or as soon as it scrolls into view if
    // that comes later.
    const WORDS_START = 0.74;
    const WORD_STAGGER = 0.175;
    const MATCHUP_START = 0.9;

    // cubic-bezier(0, 0, 0, 1) in the Jitter file: a hard expo-style ease-out
    const SETTLE = "expo.out";

    // Wrap each word of the title in a masked span so it can drop in on its own.
    // Text nodes are split on whitespace; inline tags such as <br> are left alone.
    const wrapWords = (root) => {
        const words = [];
        const walk = (node) => {
            Array.from(node.childNodes).forEach((child) => {
                if (child.nodeType === Node.ELEMENT_NODE) return walk(child);
                if (child.nodeType !== Node.TEXT_NODE || !child.textContent.trim()) return;
                const fragment = document.createDocumentFragment();
                child.textContent.split(/(\s+)/).forEach((part) => {
                    if (!part) return;
                    if (!part.trim()) return fragment.appendChild(document.createTextNode(part));
                    const mask = document.createElement("span");
                    mask.className = "home-teams__word";
                    const word = document.createElement("span");
                    word.className = "home-teams__word-inner";
                    word.textContent = part;
                    mask.appendChild(word);
                    fragment.appendChild(mask);
                    words.push(word);
                });
                child.replaceWith(fragment);
            });
        };
        walk(root);
        return words;
    };

    const setupHero = (hero) => {
        const image = hero.querySelector("[data-teams-image]");
        const title = hero.querySelector("[data-teams-title]");
        if (!image && !title) return null;

        const words = title ? wrapWords(title) : [];

        // Resting state: hidden until the hero is a quarter of the way into view.
        // The photo fades up to whatever opacity the stylesheet gives it; the
        // words start a full line above their mask so nothing peeks through.
        const imageAlpha = image ? (parseFloat(getComputedStyle(image).opacity) || 1) : 1;
        if (image) motion.set(image, { autoAlpha: 0, scale: 1.1, y: () => image.offsetHeight * 0.2, transformOrigin: "50% 50%" });
        if (words.length) motion.set(words, { yPercent: -130 });

        const entrance = motion.timeline({
            scrollTrigger: { trigger: hero, start: "top 75%", once: true }
        });
        if (image) {
            entrance
                .to(image, { autoAlpha: imageAlpha, duration: 0.8, ease: "none" }, 0)
                .to(image, { y: 0, duration: 0.8, ease: SETTLE }, 0)
                .to(image, { scale: 1, duration: 1.05, ease: "power2.inOut" }, 0.56);
        }
        // Each word: quick drop past its resting line (+14%), then ease back up.
        words.forEach((word, index) => {
            const at = WORDS_START + index * WORD_STAGGER;
            entrance
                .to(word, { yPercent: 14, duration: 0.24, ease: "power3.out" }, at)
                .to(word, { yPercent: 0, duration: 0.47, ease: "power2.inOut" }, at + 0.24);
        });

        // Parallax: scrubbed across the hero's full pass through the viewport
        const drift = (target, amount) => motion.fromTo(target,
            { yPercent: -amount / 2 },
            {
                yPercent: amount / 2,
                ease: "none",
                scrollTrigger: {
                    trigger: hero,
                    start: "top bottom",
                    end: "bottom top",
                    scrub: 0.5,
                    invalidateOnRefresh: true
                }
            });
        if (image) drift(image, IMAGE_DRIFT);
        if (title) drift(title, TITLE_DRIFT);

        return entrance;
    };

    const setupMatchup = (section, heroEntrance) => {
        const matchup = section.querySelector("[data-teams-matchup]");
        const cards = Array.from(section.querySelectorAll("[data-teams-card]"));
        const vs = section.querySelector("[data-teams-vs]");
        const button = section.querySelector("[data-teams-button]");
        const trigger = matchup || button;
        if (!trigger) return;

        motion.set(cards, { autoAlpha: 0, y: 44 });
        // The VS badge is centred with a CSS translate; GSAP keeps that and adds scale.
        if (vs) motion.set(vs, { autoAlpha: 0, scale: 1.2 });
        if (button) motion.set(button, { autoAlpha: 0, scale: 1.2, transformOrigin: "50% 50%" });

        const entrance = motion.timeline({ paused: true });
        ScrollTrigger.create({
            trigger,
            start: "top 85%",
            once: true,
            onEnter: () => {
                // Hold the designer's offset from the photo if the hero is still
                // animating; otherwise the cards were scrolled to and go at once.
                const elapsed = heroEntrance ? heroEntrance.time() : MATCHUP_START;
                motion.delayedCall(Math.max(0, MATCHUP_START - elapsed), () => entrance.play());
            }
        });

        cards.forEach((card, index) => {
            const at = index * 0.24;
            entrance
                .to(card, { autoAlpha: 1, duration: 1, ease: "none" }, at)
                .to(card, { y: 0, duration: 1, ease: SETTLE }, at);
        });
        if (vs) {
            entrance
                .to(vs, { autoAlpha: 1, duration: 0.1, ease: "none" }, 0)
                .to(vs, { scale: 1, duration: 1.34, ease: SETTLE }, 0);
        }
        if (button) {
            entrance
                .to(button, { autoAlpha: 1, duration: 0.1, ease: "none" }, 0.43)
                .to(button, { scale: 1, duration: 0.83, ease: SETTLE }, 0.43);
        }
    };

    const setup = (section) => {
        const hero = section.querySelector("[data-teams-hero]");
        const heroEntrance = hero ? setupHero(hero) : null;
        setupMatchup(section, heroEntrance);
    };

    const initialize = () => {
        if (reducedMotion.matches) return;
        document.querySelectorAll("[data-teams]").forEach((section) => {
            if (!section.dataset.teamsReady) {
                section.dataset.teamsReady = "true";
                setup(section);
            }
        });
    };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
