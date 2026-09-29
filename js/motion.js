/* Motion: one orchestrated entrance, a scroll-driven process line, and quiet reveals.
   Everything is visible without JavaScript; GSAP only adds movement. */
(() => {
  if (!window.gsap || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const gsap = window.gsap;
  if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);
  const ease = 'expo.out';

  // Hero: headline, sub, actions, then the video window rises into place.
  const tl = gsap.timeline({ defaults: { ease, duration: 1.1 } });
  tl.from('.hero h1', { y: 36, opacity: 0.001 })
    .from('.hero .sub', { y: 24, opacity: 0.001 }, '-=0.85')
    .from('.hero-actions .btn', { y: 16, opacity: 0.001, stagger: 0.08 }, '-=0.85')
    .from('.hero-media', { y: 48, scale: 0.97, opacity: 0.001, duration: 1.4 }, '-=1');

  if (!window.ScrollTrigger) return;

  // Facts count up once, when they enter.
  document.querySelectorAll('[data-count]').forEach((el) => {
    const end = Number(el.dataset.count);
    const obj = { v: 0 };
    gsap.to(obj, { v: end, duration: 1.4, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 92%', once: true },
      onUpdate: () => { el.textContent = Math.round(obj.v); } });
  });

  // Section headings and blocks settle in from a readable resting state.
  gsap.utils.toArray('.section h2, .section .lead, .segment, .areas > div, .plan, .pay, .founding, .record, .faq details').forEach((el) => {
    gsap.from(el, { y: 28, opacity: 0.25, duration: 0.9, ease, scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
  });

  // Process: the line fills as you scroll and each step lights up in turn.
  const line = document.querySelector('.timeline');
  if (line) {
    gsap.fromTo(line, { '--fill': '0%' }, { '--fill': '100%', ease: 'none',
      scrollTrigger: { trigger: line, start: 'top 75%', end: 'bottom 55%', scrub: 0.6 } });
    line.querySelectorAll('li').forEach((li) => {
      window.ScrollTrigger.create({ trigger: li, start: 'top 70%', onEnter: () => li.classList.add('lit'), onLeaveBack: () => li.classList.remove('lit') });
    });
  }

  // Report pages fan out as the section scrolls through.
  const pages = document.querySelectorAll('.pages img');
  if (pages.length === 3) {
    const st = { trigger: '.pages', start: 'top 85%', end: 'center 45%', scrub: 0.8 };
    gsap.fromTo(pages[0], { rotate: 0, x: '35%', y: 10 }, { rotate: -6, x: '0%', y: 28, ease: 'none', scrollTrigger: st });
    gsap.fromTo(pages[2], { rotate: 0, x: '-35%', y: 10 }, { rotate: 6, x: '0%', y: 28, ease: 'none', scrollTrigger: st });
  }
})();
