/**
 * A reusable feature accordion: pointer selection on desktop, reading-position
 * selection on mobile, and explicit controls for touch and keyboard use.
 */
(() => {
    "use strict";

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hoverPointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const motion = window.gsap;

    // HLS (.m3u8) item videos need hls.js outside Safari; it loads on the first one played.
    const HLS_SRC = "https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js";
    let hlsLoader = null;
    const loadHls = () => {
        if (window.Hls) return Promise.resolve(window.Hls);
        if (!hlsLoader) {
            hlsLoader = new Promise((resolve) => {
                const script = document.createElement("script");
                script.src = HLS_SRC;
                script.async = true;
                script.onload = () => resolve(window.Hls || null);
                script.onerror = () => resolve(null);
                document.head.append(script);
            });
        }
        return hlsLoader;
    };

    class FeatureAccordion {
        constructor(root) {
            this.root = root;
            this.rail = root.querySelector(".bb-feature__rail");
            this.stage = root.querySelector("[data-feature-stage]");
            this.list = root.querySelector(".bb-feature__list");
            this.items = Array.from(root.querySelectorAll("[data-feature-item]"), (element) => {
                const media = element.querySelector("[data-feature-media]");
                const layer = document.createElement("div");
                layer.className = "bb-feature__layer";
                layer.id = media.id + "-desktop";
                this.stage.append(layer);
                // The image and/or video, moved between the row and the desktop stage as one.
                const image = media.querySelector(".bb-feature__visual");

                return {
                    element,
                    trigger: element.querySelector("[data-feature-trigger]"),
                    panel: element.querySelector("[data-feature-panel]"),
                    media,
                    imageHome: media.firstElementChild,
                    image,
                    video: image ? image.querySelector("[data-feature-video]") : null,
                    videoLoaded: false,
                    videoWanted: false,
                    layer
                };
            });
            this.hasVideo = this.items.some((item) => item.video);
            this.inView = !window.IntersectionObserver;
            this.active = 0;
            this.desktop = null;
            this.timeline = null;
            this.frame = null;
            this.pointerFrame = null;
            this.pointerY = null;
            this.stageMove = null;
            this.stageTarget = null;
            this.imageOrder = 1;
            this.scrollFrame = null;
            this.scrollStops = [];
            this.lastScrollY = window.scrollY;
            this.keyboardSelection = false;

            root.classList.add("is-enhanced");
            this.layout();
            this.bindEvents();
            this.reveal();
            this.watchVideos();
        }

        duration(property = "--bb-motion-duration") {
            const value = getComputedStyle(this.root).getPropertyValue(property).trim();
            return (parseFloat(value) || 0) / (value.endsWith("ms") ? 1000 : 1);
        }

        bindEvents() {
            // Hover selects on desktop; clicks retain touch and keyboard activation. A click
            // anywhere in the row (title, description or image) selects it, not just the title.
            this.root.addEventListener("click", (event) => {
                this.keyboardSelection = event.detail === 0;
                const index = this.items.findIndex((item) => item.element.contains(event.target));
                if (index !== -1 && index !== this.active) this.select(index);
            });
            window.addEventListener("scroll", () => this.scheduleScroll(), { passive: true });
            ["touchstart", "pointerdown", "wheel"].forEach((name) => {
                window.addEventListener(name, () => { this.keyboardSelection = false; }, { passive: true });
            });
            window.addEventListener("keydown", (event) => {
                if (event.key === "Tab") this.keyboardSelection = true;
            });

            // A row moving under a resting pointer during scroll should not select itself.
            this.list.addEventListener("pointermove", (event) => {
                if (!this.canHover(event)) return;
                const index = this.items.findIndex((item) => item.element.contains(event.target));
                this.pointerY = reducedMotion.matches ? null : event.clientY;
                if (index !== -1 && index !== this.active) this.select(index);
                if (reducedMotion.matches || this.pointerFrame !== null) return;
                this.pointerFrame = requestAnimationFrame(() => {
                    this.pointerFrame = null;
                    this.moveImage(this.imagePosition());
                });
            });
            this.list.addEventListener("pointerleave", () => {
                this.pointerY = null;
                if (this.desktop) this.moveImage(this.imagePosition());
            });

            this.root.addEventListener("keydown", (event) => {
                this.keyboardSelection = true;
                const index = this.items.findIndex((item) => item.trigger === event.target);
                if (index < 0) return;
                this.pointerY = null;
                const next = {
                    ArrowDown: (index + 1) % this.items.length,
                    ArrowUp: (index + this.items.length - 1) % this.items.length,
                    Home: 0,
                    End: this.items.length - 1
                }[event.key];
                if (next === undefined) return;
                event.preventDefault();
                this.items[next].trigger.focus();
            });

            let viewportWidth = window.innerWidth;
            window.addEventListener("resize", () => {
                // Mobile browser chrome can change height during a scroll.
                // Only a width change needs to reset the mobile layout.
                if (this.desktop || window.innerWidth !== viewportWidth) this.scheduleLayout();
                viewportWidth = window.innerWidth;
            }, { passive: true });
            reducedMotion.addEventListener("change", () => {
                this.root.classList.remove("is-reveal-pending");
                this.layout();
            });
            hoverPointer.addEventListener("change", () => this.scheduleLayout());

            if (window.ResizeObserver) {
                let width = this.root.getBoundingClientRect().width;
                this.resizeObserver = new ResizeObserver((entries) => {
                    const nextWidth = entries[0].contentRect.width;
                    if (Math.abs(nextWidth - width) > 0.5) {
                        width = nextWidth;
                        this.scheduleLayout();
                    }
                });
                this.resizeObserver.observe(this.root);
            }
            if (document.fonts) document.fonts.ready.then(() => this.scheduleLayout());
        }

        canHover(event) {
            return this.desktop && hoverPointer.matches && event.pointerType !== "touch";
        }

        scheduleLayout() {
            if (this.frame !== null) return;
            this.frame = requestAnimationFrame(() => {
                this.frame = null;
                this.layout();
            });
        }

        layout() {
            if (this.timeline) this.timeline.kill();
            if (this.stageMove) this.stageMove.tween.kill();
            if (this.pointerFrame !== null) cancelAnimationFrame(this.pointerFrame);
            if (this.scrollFrame !== null) cancelAnimationFrame(this.scrollFrame);
            this.timeline = null;
            this.stageMove = null;
            this.stageTarget = null;
            this.pointerFrame = null;
            this.pointerY = null;
            this.scrollFrame = null;
            this.root.classList.remove("is-transitioning");

            // Read Bootstrap's actual layout instead of duplicating its breakpoint in JS.
            const desktop = getComputedStyle(this.rail).display !== "none";
            this.panelDuration = this.duration();
            this.imageDuration = this.duration("--bb-feature-image-duration");
            if (desktop !== this.desktop) {
                this.desktop = desktop;
                this.items.forEach((item) => {
                    if (item.image) (desktop ? item.layer : item.imageHome).append(item.image);
                });
            }
            this.mobileScroll = !desktop && !reducedMotion.matches && this.items.length > 1 &&
                this.root.dataset.featureScroll === "true";
            this.root.classList.toggle("is-scroll-driven", this.mobileScroll);
            this.reserveMobileSpace();
            this.setAccessibility();
            this.settle();
            this.lastScrollY = window.scrollY;
            this.measureImageBounds();
            this.moveImage(this.desktop ? this.imagePosition() : 0, false);
            if (motion && !reducedMotion.matches && this.panelDuration > 0) {
                this.stageMove = motion.quickTo(this.stage, "y", {
                    duration: this.imageDuration,
                    ease: "power3.out"
                });
            }
            if (this.mobileScroll) this.updateFromScroll(true);
            this.syncVideos();
        }

        reserveMobileSpace() {
            this.list.style.removeProperty("min-height");
            this.scrollStops = [];
            if (!this.mobileScroll) return;

            // Reserve one expanded item, not a separate blank area per row. Keeping
            // the section height stable prevents selections from moving content below it.
            this.items.forEach(({ panel, media }) => {
                panel.style.height = "0px";
                media.style.height = "0px";
            });
            const closedHeight = this.list.getBoundingClientRect().height;
            const top = this.list.getBoundingClientRect().top;
            this.scrollStops = this.items.map(({ trigger }) => trigger.getBoundingClientRect().top - top);
            const itemSpace = this.items.map(({ panel, media }) => ({
                media: media.scrollHeight,
                total: panel.scrollHeight + media.scrollHeight
            }));
            this.expandedSpace = Math.max(...itemSpace.map(({ total }) => total));
            this.mediaSpace = Math.max(...itemSpace.map(({ media }) => media));
            // Allow for subpixel rounding while two heights animate in opposite directions.
            this.list.style.minHeight = Math.ceil(closedHeight + this.expandedSpace) + 2 + "px";
            const header = parseFloat(getComputedStyle(this.root).getPropertyValue("--header-height")) || 0;
            const availableHeight = Math.max(0, window.innerHeight - header);
            // Open sooner on the way down, preserving the existing reverse position.
            // Cap the advance so sparse copy cannot overlap the direction thresholds.
            // Cache both lines so mobile toolbar changes cannot select a row.
            this.reverseLine = header + availableHeight * 0.58;
            this.forwardLine = this.reverseLine + Math.min(availableHeight * 0.12,
                this.expandedSpace - this.mediaSpace);
        }

        scheduleScroll() {
            if (!this.mobileScroll || this.scrollFrame !== null) return;
            this.scrollFrame = requestAnimationFrame(() => {
                this.scrollFrame = null;
                this.updateFromScroll();
            });
        }

        updateFromScroll(initial = false) {
            const scroll = Math.max(0, window.scrollY);
            const delta = scroll - this.lastScrollY;
            if (!initial && Math.abs(delta) < 2) return;
            this.lastScrollY = scroll;
            if (!this.mobileScroll || !this.scrollStops.length ||
                (this.keyboardSelection && this.root.contains(document.activeElement))) return;

            // One list position read per frame. A shared expansion allowance keeps the
            // targets ordered even when a row has no image or a much shorter description.
            // The opening tween never shifts these targets or queues intermediate selections.
            const top = this.list.getBoundingClientRect().top;
            let index = this.active;
            const band = initial ? 0 : 18;
            if (initial) index = 0;
            if (initial || delta > 0) {
                while (index < this.items.length - 1 &&
                    top + this.scrollStops[index + 1] + this.expandedSpace < this.forwardLine - band) index++;
            } else {
                while (index > 0 &&
                    top + this.scrollStops[index] + this.mediaSpace > this.reverseLine + band) index--;
            }
            if (index !== this.active) this.select(index, "scroll");
        }

        setAccessibility() {
            this.items.forEach((item, index) => {
                const selected = index === this.active;
                item.trigger.setAttribute("aria-expanded", String(selected));
                item.trigger.setAttribute("aria-disabled", String(selected));
                item.trigger.setAttribute("aria-controls",
                    (this.desktop ? item.layer.id : item.media.id) + " " + item.panel.id);
                item.panel.setAttribute("aria-hidden", String(!selected));
                item.panel.inert = !selected;
                item.media.setAttribute("aria-hidden", String(this.desktop || !selected));
                item.media.inert = this.desktop || !selected;
                item.layer.setAttribute("aria-hidden", String(!this.desktop || !selected || !item.image));
                item.layer.inert = !this.desktop || !selected;
                if (item.image) item.layer.setAttribute("aria-labelledby", item.trigger.id);
            });
        }

        settle() {
            this.imageOrder = 1;
            this.items.forEach((item, index) => {
                const selected = index === this.active;
                item.panel.style.height = selected ? "auto" : "0px";
                item.panel.style.opacity = selected ? "1" : "0";
                item.media.style.height = !this.desktop && selected ? "auto" : "0px";
                item.media.style.opacity = selected ? "1" : "0";
                item.layer.style.visibility = this.desktop && selected ? "visible" : "hidden";
                item.layer.style.opacity = selected ? "1" : "0";
                item.layer.style.zIndex = selected ? "1" : "0";
            });
        }

        moveImage(y, animate = true) {
            if (animate && this.stageTarget !== null && Math.abs(y - this.stageTarget) < 0.5) return;
            this.stageTarget = y;
            if (this.stageMove && animate && !reducedMotion.matches) {
                this.stageMove(y);
                return;
            }
            if (this.stageMove) this.stageMove.tween.pause();
            if (motion) {
                motion.set(this.stage, { y });
            } else {
                this.stage.style.transform = "translateY(" + y + "px)";
            }
        }

        measureImageBounds() {
            const rail = this.rail.getBoundingClientRect();
            const height = this.stage.getBoundingClientRect().height;
            this.imageBounds = {
                top: rail.top + window.scrollY,
                height,
                travel: Math.max(0, rail.height - height)
            };
        }

        imagePosition() {
            // Pointer frames use cached geometry; selection measures its final
            // bounds once so an expanding panel cannot keep shifting the target.
            const { height, travel } = this.imageBounds;
            const top = this.imageBounds.top - window.scrollY;
            if (this.pointerY !== null) {
                return Math.max(0, Math.min(travel, this.pointerY - top - height / 2));
            }
            if (this.active === 0) return 0;
            if (this.active === this.items.length - 1) return travel;

            const item = this.items[this.active];
            const title = item.trigger.getBoundingClientRect();
            const panel = item.panel.getBoundingClientRect();
            const centered = title.top - top + (title.height + panel.height - height) / 2;
            // A slight bias toward the item's place in the list softens edge alignment.
            const distributed = (this.active / (this.items.length - 1)) * travel;
            return Math.max(0, Math.min(travel, centered * 0.85 + distributed * 0.15));
        }

        select(index, source = "manual") {
            if (index === this.active) return;
            if (this.timeline) this.timeline.kill();
            if (source !== "scroll") this.lastScrollY = window.scrollY;

            // Freeze only the opening and visible blocks. Closed rows need no
            // layout/style reads, even when a fast selection interrupts a tween.
            const blocks = this.items.flatMap((item, itemIndex) => {
                const selected = itemIndex === index;
                const nodes = this.desktop ? [item.panel] : [item.panel, item.media];
                return nodes.filter((node) => selected || node.style.height !== "0px" || Number(node.style.opacity) > 0).map((node) => ({
                    node,
                    selected,
                    height: node.getBoundingClientRect().height,
                    opacity: Number(node.style.opacity)
                }));
            });

            this.active = index;
            this.setAccessibility();
            this.syncVideos();
            this.root.classList.add("is-transitioning");

            // Measure the final layout once; no guessed max-height or clipped copy.
            blocks.forEach((block) => {
                block.node.style.height = block.selected ? "auto" : "0px";
            });
            blocks.forEach((block) => {
                block.targetHeight = block.node.getBoundingClientRect().height;
            });
            this.measureImageBounds();
            const targetY = this.desktop ? this.imagePosition() : 0;

            const duration = this.panelDuration;
            if (!motion || reducedMotion.matches || duration === 0) {
                this.settle();
                this.moveImage(targetY, false);
                this.root.classList.remove("is-transitioning");
                return;
            }

            blocks.forEach((block) => {
                block.node.style.height = block.height + "px";
                block.node.style.opacity = String(block.opacity);
            });

            this.timeline = motion.timeline({
                defaults: { duration, ease: "power3.out", overwrite: "auto" },
                onComplete: () => {
                    this.settle();
                    if (this.desktop) {
                        this.measureImageBounds();
                        this.moveImage(this.imagePosition());
                    }
                    this.timeline = null;
                    this.root.classList.remove("is-transitioning");
                }
            });
            blocks.forEach((block) => {
                this.timeline.to(block.node, {
                    height: block.targetHeight,
                    opacity: block.selected ? 1 : 0
                }, 0);
            });

            if (this.desktop) {
                const imageDuration = this.imageDuration;
                this.moveImage(targetY);
                const item = this.items[index];
                if (item.image) {
                    // Crossfade full-size photos without animating a clipping mask.
                    // Keep the current composite intact when a new selection arrives.
                    if (item.layer.style.visibility === "hidden") {
                        motion.set(item.layer, { opacity: 0 });
                        item.layer.style.zIndex = String(++this.imageOrder);
                    }
                    item.layer.style.visibility = "visible";
                    // On a rapid reversal, fade the upper layers from their current
                    // opacities instead of raising the underlying photo abruptly.
                    this.items.forEach(({ layer }) => {
                        if (layer.style.visibility === "hidden" || Number(layer.style.zIndex) <= Number(item.layer.style.zIndex)) return;
                        this.timeline.to(layer, {
                            opacity: 0,
                            duration: imageDuration,
                            ease: "power3.out"
                        }, 0);
                    });
                    this.timeline.to(item.layer, {
                        opacity: 1,
                        duration: imageDuration,
                        ease: "power3.out"
                    }, 0);
                } else {
                    this.items.forEach(({ layer }) => {
                        if (layer.style.visibility === "hidden") return;
                        this.timeline.to(layer, { opacity: 0, duration: imageDuration }, 0);
                    });
                }
            }
        }

        watchVideos() {
            if (!this.hasVideo || !window.IntersectionObserver) return;
            // Only play while the section is on screen.
            new IntersectionObserver((entries) => {
                this.inView = entries[entries.length - 1].isIntersecting;
                this.syncVideos();
            }).observe(this.root);
        }

        // Play the active item's video and stop the rest. Nothing downloads until an
        // item plays; the image stays as its placeholder for reduced motion and Data Saver.
        syncVideos() {
            if (!this.hasVideo) return;
            const saveData = navigator.connection && navigator.connection.saveData;
            const allowed = this.inView && !reducedMotion.matches && !saveData;
            this.items.forEach((item, index) => {
                if (!item.video) return;
                if (allowed && index === this.active) {
                    this.playVideo(item);
                } else {
                    this.stopVideo(item);
                }
            });
        }

        playVideo(item) {
            const video = item.video;
            const type = video.dataset.featureVideo;
            item.videoWanted = true;

            if (type === "embed") {
                if (video.firstElementChild) return;
                const frame = document.createElement("iframe");
                frame.src = video.dataset.src;
                frame.title = video.dataset.title || "";
                frame.allow = "autoplay; encrypted-media; picture-in-picture";
                frame.tabIndex = -1;
                // Players show a moment of their own UI before the video starts; keep the image up until then.
                frame.addEventListener("load", () => {
                    setTimeout(() => {
                        if (frame.isConnected) video.classList.add("is-playing");
                    }, 600);
                }, { once: true });
                video.append(frame);
                return;
            }

            video.muted = true;
            const play = () => {
                if (!item.videoWanted) return;
                const attempt = video.play();
                if (attempt) attempt.catch(() => {});
            };
            if (item.videoLoaded) {
                play();
                return;
            }
            item.videoLoaded = true;
            video.addEventListener("playing", () => video.classList.add("is-playing"));

            if (type === "hls" && !video.canPlayType("application/vnd.apple.mpegurl")) {
                loadHls().then((Hls) => {
                    if (!Hls || !Hls.isSupported()) return;
                    const hls = new Hls({ capLevelToPlayerSize: true });
                    hls.loadSource(video.dataset.src);
                    hls.attachMedia(video);
                    play();
                });
                return;
            }
            video.src = video.dataset.src;
            play();
        }

        stopVideo(item) {
            const video = item.video;
            item.videoWanted = false;
            if (video.dataset.featureVideo === "embed") {
                // Cross-origin players can't be paused reliably; removing the frame stops
                // playback and its downloads. It reloads the next time the item opens.
                video.classList.remove("is-playing");
                video.replaceChildren();
            } else if (!video.paused) {
                video.pause();
            }
        }

        reveal() {
            if (reducedMotion.matches || !window.IntersectionObserver) return;
            if (this.root.getBoundingClientRect().top < window.innerHeight * 0.9) return;
            this.root.classList.add("is-reveal-pending");
            const observer = new IntersectionObserver((entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    this.root.classList.remove("is-reveal-pending");
                    observer.disconnect();
                }
            }, { threshold: 0.08 });
            observer.observe(this.root);
        }
    }

    const initialize = () => {
        document.querySelectorAll("[data-feature-accordion]").forEach((root) => {
            if (!root.classList.contains("is-enhanced")) new FeatureAccordion(root);
        });
    };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
