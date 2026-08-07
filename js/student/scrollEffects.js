/* =========================================================
   SCROLL EFFECTS (shared)

   Reusable across any page in the app — currently used by the
   landing page, the student dashboard, and the admin dashboard.
   Three pages needing the same reveal/parallax/count-up behavior
   is what justified pulling this out rather than duplicating it
   (or, worse, each page shipping its own slightly-different copy
   with its own animation-class names that could collide with
   another page's CSS — see admin.css's .admin-wrap scoping notes
   for why that matters here).

   All of this respects prefers-reduced-motion, and parallax
   skips its per-frame work entirely on mobile widths (see
   initParallax) rather than just hiding the result with CSS —
   scroll-linked JS work has a real battery/CPU cost, and most
   users here are on phones. 768px is the shared mobile/desktop
   line across the app's CSS (dashboard.css's own layout switch,
   and the breakpoint admin.css's tab bar unsticks at) — keep
   this in sync with those if either changes.
========================================================= */

let parallaxInitialized = false;

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Adds .reveal-visible to each element matching `selector` once
 * it scrolls into view. The element's own CSS (e.g. .reveal or
 * a page-specific variant like .reveal-bounce) defines what
 * "hidden" and "visible" actually look like — this function only
 * handles the *timing*, not the animation style.
 */
export function initScrollReveal(selector = "[data-reveal]") {
  const revealEls = document.querySelectorAll(selector);
  if (!revealEls.length) return;

  if (prefersReducedMotion()) {
    revealEls.forEach((el) => el.classList.add("reveal-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("reveal-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 },
  );

  revealEls.forEach((el) => observer.observe(el));
}

/**
 * Sets up ONE persistent window scroll listener for parallax,
 * shared across every page in the SPA. Only ever attaches once
 * per full page load (module-level flag) — each page's render
 * just adds/removes [data-parallax-speed] elements in the DOM,
 * and this listener re-queries fresh on every tick, so it
 * automatically picks up whatever's currently on screen without
 * needing to know which page called it first.
 */
export function initParallax(selector = "[data-parallax-speed]") {
  if (parallaxInitialized) return;
  parallaxInitialized = true;

  if (prefersReducedMotion()) return;

  let ticking = false;

  function updateParallax() {
    if (window.innerWidth < 768) {
      ticking = false;
      return;
    }

    const scrollY = window.scrollY;

    document.querySelectorAll(selector).forEach((shape) => {
      const speed = parseFloat(shape.dataset.parallaxSpeed) || 0.15;
      shape.style.transform = `translateY(${scrollY * speed}px)`;
    });

    ticking = false;
  }

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        requestAnimationFrame(updateParallax);
        ticking = true;
      }
    },
    { passive: true },
  );
}

/**
 * Animates a number counting up from 0 to `target` inside `el` —
 * the classic gamified-app stat reveal. Jumps straight to the
 * final value if the user prefers reduced motion.
 */
export function animateCountUp(el, target, duration = 900) {
  if (!el) return;

  if (prefersReducedMotion() || !target) {
    el.textContent = target;
    return;
  }

  const start = performance.now();

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = Math.round(eased * target);

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = target;
    }
  }

  requestAnimationFrame(tick);
}
