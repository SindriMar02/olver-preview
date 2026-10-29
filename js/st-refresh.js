/* Boom Ball inline "gsap-scrolltrigger-js-after", verbatim */
(function () {
    var ST = window.ScrollTrigger;
    if (!ST) return;
    var refresh = ST.refresh.bind(ST), touching = false, pending = null;
    var busy = function () { return touching || ST.isScrolling(); };
    var flush = function () {
        if (pending === null || busy()) return;
        var safe = pending;
        pending = null;
        refresh(safe);
    };
    ST.refresh = function (safe) {
        if (!busy()) return refresh(safe);
        pending = pending === null ? !!safe : pending && !!safe;
    };
    window.addEventListener("touchstart", function () { touching = true; }, { passive: true });
    ["touchend", "touchcancel"].forEach(function (name) {
        window.addEventListener(name, function (event) {
            touching = !!(event.touches && event.touches.length);
            if (!ST.isScrolling()) flush();
        }, { passive: true });
    });
    ST.addEventListener("scrollEnd", flush);
    ST.config({ autoRefreshEvents: "visibilitychange,DOMContentLoaded,resize" });
    window.addEventListener("load", function () { ST.refresh(); });
})();
