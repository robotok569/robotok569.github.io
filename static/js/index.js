/* ============================================================
   RoboTok project page — all interactivity (no build step, no deps)
   ============================================================ */
(function () {
  'use strict';

  /* ---------------------------------------------------------
     Missing-media placeholder
     A clip that fails to load leaves a labelled frame of the
     right shape rather than a broken player, so the section
     around it keeps its layout and says what is absent.
     --------------------------------------------------------- */
  function showMissing(el, path) {
    var box = document.createElement('div');
    box.className = 'media-missing';
    box.innerHTML =
      '<strong>video unavailable</strong>' +
      '<code>' + path + '</code>';
    if (el.parentNode) el.parentNode.replaceChild(box, el);
  }

  /* ---------------------------------------------------------
     Autoplay, once per visitor
     The two heaviest things on the page -- the 26 MB project video and the
     ~4 MB simulation grids -- used to start on their own on every visit. That
     is the right introduction the first time somebody arrives and the wrong
     tax every time after, since a reader who has already watched pays for it
     again on each return. So a video marked data-autoplay-once starts by
     itself on a visitor's first visit and afterwards waits to be pressed.

     The decision is frozen here, at load, rather than per video: a first visit
     autoplays everything marked, as it always did, instead of the first such
     video consuming the allowance and leaving the rest still. The flag is only
     written once one of them has actually played, so a visit that never
     reaches one keeps its turn. Storage can throw outright (private windows,
     blocked site data), and a visitor we cannot remember is treated as new --
     the failure that repeats a video is better than the one that silently
     never plays it.
     --------------------------------------------------------- */
  var AUTOPLAY_KEY = 'robotok:autoplayed';
  var autoplayAllowed = (function () {
    try { return !localStorage.getItem(AUTOPLAY_KEY); } catch (err) { return true; }
  })();

  function noteAutoplayed() {
    if (!autoplayAllowed) return;
    try { localStorage.setItem(AUTOPLAY_KEY, '1'); } catch (err) { /* not remembered */ }
  }

  /* ---------------------------------------------------------
     Lazy-load videos (data-src -> src) when they scroll into view
     --------------------------------------------------------- */
  function loadVideo(video) {
    if (video.dataset.loaded) return;
    video.dataset.loaded = '1';
    var path = video.dataset.src;
    if (!path) return;
    video.addEventListener('error', function () { showMissing(video, path); }, { once: true });
    video.src = path;
    video.load();
    // src is still set, so the controls' play button works and preload can do
    // its small metadata fetch; what is withheld is only starting it unasked.
    if (playObserver) playObserver.observe(video);
    if (video.hasAttribute('data-autoplay-once') && !autoplayAllowed) return;
    if (video.hasAttribute('data-autoplay-once')) noteAutoplayed();
    var p = video.play();
    if (p && p.catch) p.catch(function () { /* autoplay blocked — user can press play */ });
  }

  var videoObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { loadVideo(e.target); obs.unobserve(e.target); }
        });
      }, { rootMargin: '250px 0px' })
    : null;

  /* ---------------------------------------------------------
     Playing only while somebody is looking
     Every clip here loops, so left to itself a page in a tab someone opened
     and forgot goes on playing for as long as the tab lives -- burning their
     battery, and re-fetching whatever the media cache has since evicted, which
     for the 26 MB project video is most of it. A clip is paused whenever it is
     off screen or its tab is in the background, and resumes when it comes
     back.

     Only clips this paused are resumed. A reader who pressed pause meant it,
     and scrolling away and back is not consent to start again -- so the flag
     is set on the way down and is what licenses the way up.
     --------------------------------------------------------- */
  function pauseOffscreen(video) {
    if (video.paused) return;              // already still, or never started
    video.pause();
    video.dataset.autoPaused = '1';
  }

  function resumeOnscreen(video) {
    if (!video.dataset.autoPaused) return;
    delete video.dataset.autoPaused;
    var p = video.play();
    if (p && p.catch) p.catch(function () { /* refused; the controls still work */ });
  }

  function syncPlayback(video) {
    if (document.hidden || !video.dataset.onscreen) pauseOffscreen(video);
    else resumeOnscreen(video);
  }

  var playObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          e.target.dataset.onscreen = e.isIntersecting ? '1' : '';
          syncPlayback(e.target);
        });
      }, { threshold: 0 })
    : null;

  document.addEventListener('visibilitychange', function () {
    document.querySelectorAll('video').forEach(syncPlayback);
  });

  function registerVideos(root) {
    (root || document).querySelectorAll('video[data-src]').forEach(function (v) {
      if (v.dataset.registered) return;
      v.dataset.registered = '1';
      if (videoObserver) videoObserver.observe(v); else loadVideo(v);
    });
  }

  /* ---------------------------------------------------------
     Rollout galleries
     Built from data-* attributes on .rollout-gallery elements.
     File convention: <data-dir>/<view.prefix>_rollout_<n>.mp4

     Nothing on the page carries that class yet -- this is what the real-world
     task sections will be built from once their clips exist. Kept rather than
     deleted so adding them is a block of markup and no new code.
     --------------------------------------------------------- */
  function buildGallery(el) {
    var title = el.dataset.title || '';
    var note = el.dataset.note || '';
    var dir = (el.dataset.dir || '.').replace(/\/$/, '');
    var count = parseInt(el.dataset.rollouts || '3', 10);
    var views;
    try { views = JSON.parse(el.dataset.views || '[]'); } catch (err) { views = []; }
    if (!views.length) views = [{ prefix: 'cam1', label: 'View 1' }];

    var pills = '';
    for (var i = 1; i <= count; i++) {
      pills += '<button class="pill' + (i === 1 ? ' is-active' : '') +
        '" type="button" data-rollout="' + i + '">Rollout ' + i + '</button>';
    }

    var gridClass = views.length >= 3 ? 'grid-3' : (views.length === 2 ? 'grid-2' : 'grid-2');

    el.innerHTML =
      '<h3 class="title is-4 has-text-centered" style="margin-bottom:.35rem;color:var(--ink)">' + title + '</h3>' +
      (note ? '<p class="section-sub" style="margin-bottom:1rem">' + note + '</p>' : '') +
      '<div class="rollout-controls"><label>Rollout:</label><div class="pill-group">' + pills + '</div></div>' +
      '<div class="grid ' + gridClass + ' rollout-videos"></div>';

    var wrap = el.querySelector('.rollout-videos');

    function render(n) {
      wrap.innerHTML = views.map(function (v) {
        var path = dir + '/' + v.prefix + '_rollout_' + n + '.mp4';
        return '<div class="video-card">' +
          '<video muted playsinline controls preload="metadata" data-src="' + path + '"></video>' +
          '<p class="video-label">' + (v.label || v.prefix) + '</p>' +
          '</div>';
      }).join('');
      registerVideos(wrap);
      // Videos swapped in by a click are already on screen — load immediately.
      wrap.querySelectorAll('video[data-src]').forEach(loadVideo);
    }

    el.querySelectorAll('.pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        el.querySelectorAll('.pill').forEach(function (p) { p.classList.remove('is-active'); });
        pill.classList.add('is-active');
        render(pill.dataset.rollout);
      });
    });

    render(1);
  }

  /* ---------------------------------------------------------
     Simulation rollout grids
     One block per task. Every clip is a 5x10 tiling of the same
     50 evaluation episodes for one policy, so the only thing that
     changes between clips is the method and the camera. Both
     selectors keep the playhead, which is what makes two policies
     actually comparable.
     File convention: <data-dir>/<method>_<view>.mp4
     --------------------------------------------------------- */
  /* `ref` is the entry number in the page's References section, shown on the
     pill as plain text -- a link inside a button would fight the click. Base,
     Random and Ours are not papers, so they carry no number. */
  var SIM_METHODS = [
    { slug: 'base', label: 'Base' },
    { slug: 'random', label: 'Random' },
    { slug: 'flow', label: 'Flow (CoRL 2024)', ref: 3 },
    { slug: 'hand', label: 'HAND (ICRA 2026)', ref: 4 },
    { slug: 'strap', label: 'STRAP (ICLR 2025)', ref: 5 },
    { slug: 'ours', label: 'RoboTok', ours: true }
  ];
  var SIM_VIEWS = ['view0', 'view2'];
  var SIM_VIEW_LABELS = ['Camera A', 'Camera B'];

  /* The cameras a block offers, in the order it leads with. The labels name
     that order rather than the file on disk, so whichever view a block puts
     first is its Camera A and is what loads by default. data-cameras
     overrides the order per block -- bottle cap reverses it, because view2
     is the angle its rollouts read best from. (The rollout blocks further
     down use data-views for something else; these are not the same list.) */
  function simViews(el) {
    var slugs = (el.dataset.cameras || '').split(',')
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    if (!slugs.length) slugs = SIM_VIEWS;
    return slugs.map(function (slug, i) {
      return { slug: slug, label: SIM_VIEW_LABELS[i] || slug };
    });
  }

  function buildSimGrid(el) {
    var title = el.dataset.title || '';
    var note = el.dataset.note || '';
    var dir = (el.dataset.dir || '').replace(/\/$/, '');

    var head =
      '<div class="sim-grid-head">' +
      '<h3 class="sim-grid-title">' + title + '</h3>' +
      (note ? '<p class="sim-grid-note">' + note + '</p>' : '') +
      '</div>';

    // No directory yet — hold the space and say the grids are still to come.
    if (!dir) {
      el.innerHTML = head +
        '<div class="media-missing sim-grid-pending">' +
        '<strong>rollout grids coming soon</strong>' +
        '</div>';
      return;
    }

    var views = simViews(el);
    var state = { method: 'ours', view: views[0].slug };

    function pills(items, group, active) {
      return items.map(function (it) {
        var tag = it.ref ? '<span class="cite-tag">[' + it.ref + ']</span>' : '';
        return '<button class="pill' + (it.ours ? ' is-ours' : '') +
          (it.slug === active ? ' is-active' : '') +
          '" type="button" data-group="' + group + '" data-slug="' + it.slug + '">' +
          it.label + tag + '</button>';
      }).join('');
    }

    el.innerHTML = head +
      '<div class="rollout-controls sim-grid-controls">' +
      '<span class="control-set"><label>Method</label>' +
      '<span class="pill-group">' + pills(SIM_METHODS, 'method', state.method) + '</span></span>' +
      '<span class="control-set"><label>Camera</label>' +
      '<span class="pill-group">' + pills(views, 'view', state.view) + '</span></span>' +
      '</div>' +
      '<div class="sim-grid-stage">' +
      '<div class="sim-grid-gutter" aria-hidden="true">' +
      '<span class="seen">Seen objects</span><span class="unseen">Unseen</span>' +
      '</div>' +
      '<div class="sim-grid-video"></div>' +
      '</div>' +
      '<p class="sim-grid-legend">' +
      '<span class="legend-chip ok">success</span>' +
      '<span class="legend-chip bad">failure</span>' +
      '</p>';

    var stage = el.querySelector('.sim-grid-video');
    var booted = false;

    function render() {
      // Carry the playhead across, so the same frame lines up method to method.
      var prev = stage.querySelector('video');
      var at = prev ? prev.currentTime : 0;
      var path = dir + '/' + state.method + '_' + state.view + '.mp4';

      stage.innerHTML =
        '<video muted playsinline controls preload="metadata"' +
        // Only the grid the reader lands on is unprompted; one they switched
        // to with a pill is a clip they asked for, and plays either way.
        (booted ? '' : ' data-autoplay-once') +
        ' data-src="' + path + '"></video>';
      var v = stage.querySelector('video');
      if (at > 0) {
        v.addEventListener('loadedmetadata', function () {
          var d = v.duration;
          if (d && isFinite(d)) { try { v.currentTime = at % d; } catch (err) { /* seek refused */ } }
        }, { once: true });
      }
      // First paint stays lazy (these clips are ~2 MB each); a clip the reader
      // asked for by clicking is already on screen, so load it now.
      if (booted) loadVideo(v); else registerVideos(stage);
      booted = true;
    }

    el.querySelectorAll('.sim-grid-controls .pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        var group = pill.dataset.group;
        if (state[group] === pill.dataset.slug) return;
        state[group] = pill.dataset.slug;
        el.querySelectorAll('.pill[data-group="' + group + '"]').forEach(function (p) {
          p.classList.toggle('is-active', p === pill);
        });
        render();
      });
    });

    render();
  }

  /* ---------------------------------------------------------
     Corpus pull-back
     Opens on one clip filling the frame, then zooms out to the
     grid it belongs to. The grid is a single pre-rendered video
     (100 <video> elements would stall any browser), and the hero
     clip is layered over its own tile at native resolution so the
     opening frame isn't a 10x upscale of a 192px tile. It fades
     out early in the pull-back, onto the identical tile beneath.
     --------------------------------------------------------- */
  var PULLBACK_MS = 4200, PULLBACK_DELAY = 900;
  // Second leg: after the corpus settles, travel to the query block.
  var ZOOMIN_MS = 2600, SETTLE_HOLD = 1100;

  function buildCorpusZoom(el) {
    var dir = (el.dataset.dir || '').replace(/\/$/, '');
    if (!dir) return;

    var stage = document.createElement('div');
    stage.className = 'corpus-stage';
    stage.innerHTML = '<div class="corpus-plane"></div>' +
      '<button class="corpus-replay" type="button" hidden>Replay</button>';
    el.insertBefore(stage, el.firstChild);
    var plane = stage.querySelector('.corpus-plane');
    var replay = stage.querySelector('.corpus-replay');

    fetch(dir + '/manifest.json', { cache: 'force-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .catch(function () {
        showMissing(stage, dir + '/manifest.json');
        return null;
      })
      // Outside the catch above on purpose: a bug in setup() must not be
      // reported to the reader as a missing file.
      .then(function (m) { if (m) setup(m); });

    function setup(m) {
      var cols = m.cols, rows = m.rows, zoom = m.zoom || cols;
      var layers = m.layers || [];
      if (!layers.length) return;

      stage.style.aspectRatio = (cols * 16) + ' / ' + (rows * 9);

      // Each level covers the region of the plane it depicts, so one transform
      // moves them together and they stay registered at every scale.
      var els = layers.map(function (L) {
        var v = document.createElement('video');
        v.className = 'corpus-layer';
        v.muted = v.loop = v.playsInline = true;
        v.preload = 'none';
        v.style.left = (L.c0 / cols * 100) + '%';
        v.style.top = (L.r0 / rows * 100) + '%';
        v.style.width = (L.w / cols * 100) + '%';
        v.style.height = (L.h / rows * 100) + '%';
        plane.appendChild(v);
        return v;
      });
      els[0].poster = dir + '/grid_poster.jpg';

      // Hero tile centre -> stage centre at full zoom: p maps to T + s*p.
      var hc = (m.hero_col + 0.5) / cols, hr = (m.hero_row + 0.5) / rows;
      var from = 'translate(' + ((0.5 - zoom * hc) * 100).toFixed(3) + '%,' +
        ((0.5 - zoom * hr) * 100).toFixed(3) + '%) scale(' + zoom + ')';

      // The query block is a second destination, not a detail level of the
      // first, so it sits out the pull-back and fades in on the way back in.
      var qi = layers.map(function (L) { return L.role; }).indexOf('queries');
      var qLayer = qi >= 0 ? layers[qi] : null;
      var qEl = qi >= 0 ? els[qi] : null;
      var into = null;
      if (qLayer) {
        // Scale so the block spans the stage width, then centre it.
        var qs = cols / qLayer.w;
        var qc = (qLayer.c0 + qLayer.w / 2) / cols;
        var qr = (qLayer.r0 + qLayer.h / 2) / rows;
        into = 'translate(' + ((0.5 - qs * qc) * 100).toFixed(3) + '%,' +
          ((0.5 - qs * qr) * 100).toFixed(3) + '%) scale(' + qs + ')';
        qEl.style.opacity = 0;
      }

      var reduced = (window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
        typeof plane.animate !== 'function';   // no Web Animations API: show the grid, skip the move
      var anims = [], started = false;

      function run() {
        anims.forEach(function (a) { a.cancel(); });
        anims = [];
        var opts = { duration: PULLBACK_MS, delay: PULLBACK_DELAY, fill: 'both' };
        var move = plane.animate(
          [{ transform: from }, { transform: 'translate(0%,0%) scale(1)' }],
          Object.assign({ easing: 'cubic-bezier(.62,.01,.22,1)' }, opts));
        anims.push(move);
        move.onfinish = function () {
          stage.classList.add('is-settled');
          if (into) zoomIn();
        };

        // Hand off finest -> coarsest: each level bows out once the level
        // beneath it has enough pixels for the size it is being shown at.
        var overlays = els.filter(function (v, i) {
          return i > 0 && v !== qEl;
        }).reverse();
        overlays.forEach(function (v, i) {
          var f0 = 0.18 + i * 0.22, f1 = f0 + 0.2;
          anims.push(v.animate([
            { opacity: 1, offset: 0 },
            { opacity: 1, offset: f0 },
            { opacity: 0, offset: Math.min(f1, 1) },
            { opacity: 0, offset: 1 }
          ], Object.assign({ easing: 'linear' }, opts)));
        });
      }

      // Leg two: hold on the settled corpus, then push in on the query block.
      function zoomIn() {
        var opts = { duration: ZOOMIN_MS, delay: SETTLE_HOLD, fill: 'both' };
        anims.push(plane.animate(
          [{ transform: 'translate(0%,0%) scale(1)' }, { transform: into }],
          Object.assign({ easing: 'cubic-bezier(.62,.01,.22,1)' }, opts)));
        // Fade the sharp block in over the first half, once it is big enough
        // for the extra pixels to show.
        anims.push(qEl.animate([
          { opacity: 0, offset: 0 },
          { opacity: 0, offset: 0.25 },
          { opacity: 1, offset: 0.6 },
          { opacity: 1, offset: 1 }
        ], Object.assign({ easing: 'linear' }, opts)));
        stage.classList.add('is-zoomed');
      }

      function play() {
        if (started) return;
        started = true;
        els.forEach(function (v, i) {
          v.addEventListener('error', function () {
            if (i === 0) showMissing(stage, dir + '/' + layers[i].src);
          }, { once: true });
          v.src = dir + '/' + layers[i].src;
        });
        // Same tick for all levels: the hero and the tile beneath it are the
        // same clip, and the cross-fade only reads as a camera move if they
        // are on the same frame.
        els.forEach(function (v) {
          var p = v.play();
          if (p && p.catch) p.catch(function () { /* autoplay blocked */ });
        });
        if (reduced) {
          stage.classList.add('is-settled');
          els.slice(1).forEach(function (v) { v.style.opacity = 0; });
          return;
        }
        run();
        replay.hidden = false;
      }

      replay.addEventListener('click', function () {
        stage.classList.remove('is-settled');
        stage.classList.remove('is-zoomed');
        if (qEl) qEl.style.opacity = 0;
        els.forEach(function (v) { try { v.currentTime = 0; } catch (err) {} });
        run();
      });

      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) { play(); io.disconnect(); }
          });
        }, { threshold: 0.25 });
        io.observe(stage);
      } else {
        play();
      }
    }
  }

  /* ---------------------------------------------------------
     Replay buttons
     data-replay holds a selector for the video to restart. The
     video may not have lazy-loaded yet, so load it first.
     --------------------------------------------------------- */
  function initReplayButtons() {
    document.querySelectorAll('[data-replay]').forEach(function (btn) {
      var video = document.querySelector(btn.dataset.replay);
      if (!video) return;
      btn.addEventListener('click', function () {
        loadVideo(video);
        try { video.currentTime = 0; } catch (err) { /* not seekable yet */ }
        var p = video.play();
        if (p && p.catch) p.catch(function () { /* autoplay blocked */ });
      });
    });
  }

  /* ---------------------------------------------------------
     Mini retrieval demo
     A query clip and its nine nearest neighbors, each shown
     next to the 2D hand trajectory it was retrieved on. The
     trajectory is drawn to canvas rather than SVG: ten panels
     x two hands x (21 joints + 23 bones) is ~900 nodes to move
     every frame, which SVG will not do smoothly.
     --------------------------------------------------------- */

  // MediaPipe 21-joint hand. Verified against the data rather than assumed:
  // consecutive within-finger joints sit ~0.07 apart, finger boundaries ~0.20.
  var HAND_BONES = [
    [0, 1], [1, 2], [2, 3], [3, 4],          // thumb
    [0, 5], [5, 6], [6, 7], [7, 8],          // index
    [0, 9], [9, 10], [10, 11], [11, 12],     // middle
    [0, 13], [13, 14], [14, 15], [15, 16],   // ring
    [0, 17], [17, 18], [18, 19], [19, 20],   // pinky
    [5, 9], [9, 13], [13, 17]                // knuckle span
  ];
  var TRAIL_JOINTS = [0, 4, 8, 12, 16, 20];  // wrist + fingertips
  var HAND_COLOR = { L: '#3578c4', R: '#d0742a' };

  // Skeleton weights, in units of the panel scale `s`. A hand is 21 joints in
  // a space a few centimetres across, so at the earlier weights the dots met
  // each other and the bones merged into a blob wherever fingers crossed --
  // the pose stopped being readable exactly when it got interesting. Thin
  // enough that the bones read as lines between separate joints; the wrist
  // stays larger than the rest because it is the one joint the trails and the
  // torso frame are both read against. Shared by the 2D and 3D panels, which
  // draw the same skeleton and must not disagree about how heavy it is.
  var BONE_W = 1.05;
  var DOT_R = { wrist: 1.7, joint: 0.95 };

  function drawTrajectory(canvas, rec, progress) {
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Strokes are in CSS pixels, so they have to grow with the panel or the
    // skeleton comes out as hairlines once a panel is 470px wide instead of
    // 115px. 240px is the width the original weights were drawn for; the clamp
    // keeps a thumbnail legible and stops the query panel going blobby.
    var s = Math.max(0.85, Math.min(2.6, w / 240));

    // Coordinates are normalised per axis, and the canvas carries the clip's own
    // aspect ratio, so x,y map straight onto it.
    function px(f, j) { return [f[2 * j] * w, f[2 * j + 1] * h]; }

    ['L', 'R'].forEach(function (side) {
      var seq = rec[side];
      if (!seq || !seq.length) return;
      var color = HAND_COLOR[side];
      var upto = Math.max(1, Math.min(seq.length, Math.round(progress * seq.length)));

      // Trails: the path each tracked joint has taken so far.
      TRAIL_JOINTS.forEach(function (j, ji) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.globalAlpha = ji === 0 ? 0.55 : 0.32;
        ctx.lineWidth = (ji === 0 ? 2 : 1.1) * s;
        ctx.lineJoin = ctx.lineCap = 'round';
        var pen = false;
        for (var i = 0; i < upto; i++) {
          var f = seq[i];
          if (!f) { pen = false; continue; }   // hand undetected: break the line
          var p = px(f, j);
          if (pen) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
          pen = true;
        }
        ctx.stroke();
      });

      // Skeleton at the current frame.
      var cur = null;
      for (var k = upto - 1; k >= 0 && !cur; k--) cur = seq[k];
      if (!cur) return;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = BONE_W * s;
      ctx.beginPath();
      HAND_BONES.forEach(function (b) {
        var a = px(cur, b[0]), c = px(cur, b[1]);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]);
      });
      ctx.stroke();
      ctx.fillStyle = color;
      for (var j2 = 0; j2 < 21; j2++) {
        var p2 = px(cur, j2);
        ctx.beginPath();
        ctx.arc(p2[0], p2[1],
                (j2 === 0 ? DOT_R.wrist : DOT_R.joint) * s, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
  }

  /* The same trajectory in the frame retrieval actually runs on: joints in the
     clip's estimated torso frame, x lateral, y up, z forward out of the body.
     Orbit is shared by every clip and survives a query switch, so comparing two
     clips means comparing the same viewpoint. */
  // az/el orbit; tx/ty pan, held as a fraction of a panel's short side so one
  // shared offset shifts a small result panel and the big query panel by the
  // same amount of their own size.
  var view3d = { az: 0.62, el: 0.26, tx: 0, ty: 0 };
  var VIEW3D_HOME = { az: 0.62, el: 0.26, tx: 0, ty: 0 };

  // Every 3D joint of a clip, flattened once, in metres. The fit below reads
  // it on every frame, so it is worth not rebuilding per draw.
  function pts3(rec) {
    if (rec._pts3 !== undefined) return rec._pts3;
    var out = [];
    ['L3', 'R3'].forEach(function (k) {
      (rec[k] || []).forEach(function (f) {
        if (!f) return;
        for (var i = 0; i < 63; i++) out.push(f[i] / 1000);
      });
    });
    rec._pts3 = out.length ? new Float64Array(out) : null;
    return rec._pts3;
  }

  function has3d(rec) { return !!(rec && pts3(rec)); }

  // Centre and radius of a ball holding every joint of the clip plus the body
  // origin and its axis tips. Both are properties of the clip, not of the
  // camera, which is what keeps the scale fixed under rotation.
  function ball3(rec) {
    if (rec._ball !== undefined) return rec._ball;
    var pts = pts3(rec);
    if (!pts) return (rec._ball = null);
    var lo = [0, 0, 0], hi = [0.14, 0.14, 0.14];   // seed: origin + axis tips
    for (var i = 0; i < pts.length; i++) {
      var a = i % 3, v = pts[i];
      if (v < lo[a]) lo[a] = v;
      if (v > hi[a]) hi[a] = v;
    }
    var c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    var r2 = 0;
    for (var j = 0; j < pts.length; j += 3) {
      var dx = pts[j] - c[0], dy = pts[j + 1] - c[1], dz = pts[j + 2] - c[2];
      var d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) r2 = d2;
    }
    // The origin has to stay in frame too -- the joints only mean anything as
    // offsets from it.
    var o2d = c[0] * c[0] + c[1] * c[1] + c[2] * c[2];
    if (o2d > r2) r2 = o2d;
    rec._ball = { c: c, r: Math.max(0.1, Math.sqrt(r2)) };
    return rec._ball;
  }

  function draw3d(canvas, rec, progress) {
    var pts = pts3(rec);
    if (!pts) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var s = Math.max(0.85, Math.min(2.6, w / 240));
    var ca = Math.cos(view3d.az), sa = Math.sin(view3d.az);
    var ce = Math.cos(view3d.el), se = Math.sin(view3d.el);

    // Orbit about the torso frame's own up axis, then tilt. Centred on the
    // clip's own centre first, so the centre of rotation stays put on screen.
    var ball = ball3(rec);
    function flat(x, y, z) {
      x -= ball.c[0]; y -= ball.c[1]; z -= ball.c[2];
      var rx = x * ca + z * sa;
      var rz = -x * sa + z * ca;
      return [rx, y * ce - rz * se];
    }

    // One scale for the whole clip, from a radius that does not depend on the
    // angle you are looking from. Fitting the projected bounding box instead
    // re-derives the scale on every frame, so the scene swells and shrinks as
    // it turns -- rotating a rigid object must not change how big it is or how
    // far apart its parts sit.
    var axLen = 0.14;
    var m = Math.min(w, h);
    var k = m * 0.88 / (2 * ball.r);
    function proj(x, y, z) {
      var q = flat(x, y, z);
      return [w / 2 + q[0] * k + view3d.tx * m,
              h / 2 - q[1] * k + view3d.ty * m];
    }
    function pj(f, j) { return proj(f[3 * j] / 1000, f[3 * j + 1] / 1000, f[3 * j + 2] / 1000); }

    // --- the torso frame itself -------------------------------------------
    // Axes and origin only, no drawn body: where the shoulders sit in this
    // frame is not something the data says, and a torso outline would be
    // inventing it.
    var o = proj(0, 0, 0);
    ctx.font = (10 * Math.min(s, 1.7)) + 'px "Noto Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // An axis tip often lands in the middle of the hand it is measuring, so
    // the labels carry a halo rather than reading as part of the skeleton.
    ctx.lineJoin = 'round';
    function label(str, x, y) {
      ctx.strokeStyle = 'rgba(255,255,255,.92)';
      ctx.lineWidth = 3.4 * Math.min(s, 1.7);
      ctx.strokeText(str, x, y);
      ctx.fillText(str, x, y);
    }
    [[axLen, 0, 0, 'lateral'], [0, axLen, 0, 'up'], [0, 0, axLen, 'forward']].forEach(function (a) {
      var t = proj(a[0], a[1], a[2]);
      ctx.strokeStyle = '#aab6c6';
      ctx.lineWidth = 1.1 * s;
      ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(t[0], t[1]); ctx.stroke();
      // Label just past the tip, along the axis, so it never lands on the axis
      // or on the origin marker -- and anchored so the text then runs on
      // outward. Centred on that point instead, lateral and forward wrote over
      // each other at the default orbit, where the two axes leave the origin
      // only a few degrees apart and their tips land within a word's width.
      var dx = t[0] - o[0], dy = t[1] - o[1];
      var len = Math.max(1e-6, Math.sqrt(dx * dx + dy * dy));
      var ux = dx / len, uy = dy / len;
      var off = 11 * Math.min(s, 1.7);
      ctx.textAlign = ux > 0.3 ? 'left' : (ux < -0.3 ? 'right' : 'center');
      ctx.textBaseline = uy > 0.3 ? 'top' : (uy < -0.3 ? 'bottom' : 'middle');
      ctx.fillStyle = '#8494a8';
      label(a[3], t[0] + ux * off, t[1] + uy * off);
    });
    ctx.fillStyle = '#6b7a8f';
    ctx.beginPath(); ctx.arc(o[0], o[1], 2.4 * s, 0, Math.PI * 2); ctx.fill();
    // Beside the origin, so the label names the point it is pointing at rather
    // than floating in a corner -- and to the left of it, not under it: the
    // forward axis leaves the origin downward at the default orbit and would
    // run straight through the text. Set on two lines because at three times
    // the length of the "body frame" it replaces, one line reaches back across
    // the hand being measured, and on a narrow panel off the left edge.
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8494a8';
    var lh = 11 * Math.min(s, 1.7);
    var lines = ['estimated', 'torso frame'];
    var wmax = 0;
    lines.forEach(function (l) { wmax = Math.max(wmax, ctx.measureText(l).width); });
    // Held inside the panel. Drag the view far enough and the origin leaves it
    // altogether; a label pinned to the origin would follow it off the edge
    // and take the only statement of which frame this is with it.
    var lx = Math.max(o[0] - 7 * s, wmax + 4 * Math.min(s, 1.7));
    var ly = Math.max(lh, Math.min(h - lh, o[1]));
    lines.forEach(function (line, li) {
      label(line, lx, ly + (li - 0.5) * lh);
    });

    // --- the hands --------------------------------------------------------
    ['L', 'R'].forEach(function (side) {
      var seq = rec[side + '3'];
      if (!seq || !seq.length) return;
      var color = HAND_COLOR[side];
      var upto = Math.max(1, Math.min(seq.length, Math.round(progress * seq.length)));

      TRAIL_JOINTS.forEach(function (j, ji) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.globalAlpha = ji === 0 ? 0.55 : 0.32;
        ctx.lineWidth = (ji === 0 ? 2 : 1.1) * s;
        ctx.lineJoin = ctx.lineCap = 'round';
        var pen = false;
        for (var m = 0; m < upto; m++) {
          var f = seq[m];
          if (!f) { pen = false; continue; }   // ungrounded frame: break the line
          var p = pj(f, j);
          if (pen) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
          pen = true;
        }
        ctx.stroke();
      });

      var cur = null;
      for (var n = upto - 1; n >= 0 && !cur; n--) cur = seq[n];
      if (!cur) return;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = BONE_W * s;
      ctx.beginPath();
      HAND_BONES.forEach(function (b) {
        var a = pj(cur, b[0]), c = pj(cur, b[1]);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]);
      });
      ctx.stroke();
      ctx.fillStyle = color;
      for (var j2 = 0; j2 < 21; j2++) {
        var p2 = pj(cur, j2);
        ctx.beginPath();
        ctx.arc(p2[0], p2[1],
                (j2 === 0 ? DOT_R.wrist : DOT_R.joint) * s, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
  }

  function buildRetrievalMini(el) {
    var srcUrl = el.dataset.src;
    var videoDir = (el.dataset.videos || '').replace(/\/$/, '');
    if (!srcUrl) return;

    el.innerHTML = '<p class="rm-loading">Loading retrieval examples&hellip;</p>';

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }

    function start(data) {
      var queries = data.queries || [], traj = data.traj || {};
      if (!queries.length) { el.innerHTML = ''; return; }
      var live = [];    // {video, canvas, rec} currently on screen

      // Clips are not all 16:9 -- the corpus carries 4:3, 3:2 and one portrait
      // clip. Left to fill their column, those come out taller than their
      // neighbours and the grid rows go ragged. So every panel gets a slot of
      // one fixed height instead, and each clip keeps its own aspect ratio
      // inside that slot, giving back width rather than gaining height. The
      // slot is the widest ratio in the corpus, computed once rather than per
      // query so switching tabs doesn't resize the grid.
      var slotAr = 0;
      Object.keys(traj).forEach(function (k) {
        var r = traj[k];
        if (r && r.w && r.h) slotAr = Math.max(slotAr, r.w / r.h);
      });
      el.style.setProperty('--rm-slot-ar', String(slotAr || (16 / 9)));

      // Which frame the query panel is drawing in, and the one the demo opens
      // on -- 3D is what retrieval runs on, so it leads. Held outside select()
      // so it survives a query or method switch.
      var qView = '3d';

      // A clip with no depth-grounded joints has no 3D to show, so it falls
      // back for that clip alone without discarding the preference: step off it
      // and the next clip opens in 3D again.
      function effView(rec) { return (qView === '3d' && has3d(rec)) ? '3d' : '2d'; }

      var CAVEAT_BASE =
        '<p>Hand trajectories are shown two ways:</p><ol>' +
        '<li>the 3D keypoints in estimated human torso frame coordinates ' +
        '(method A.3) via an interactive panel</li>' +
        '<li>the original 2D camera space</li></ol>';

      var CAVEAT = { '2d': CAVEAT_BASE, '3d': CAVEAT_BASE };

      function legendHtml(rec) {
        return '<p class="rm-legend">' +
          '<span class="rm-key" style="--c:' + HAND_COLOR.L + '">left hand</span>' +
          '<span class="rm-key" style="--c:' + HAND_COLOR.R + '">right hand</span>' +
          '</p>' +
          '<div class="rm-caveat">' + CAVEAT[effView(rec)] + '</div>';
      }

      // Sits in the query header, over the trajectory panel it switches.
      function viewTabs(rec) {
        var cur = effView(rec);
        var off = has3d(rec) ? '' : ' disabled title="this clip has no ' +
          'depth-grounded 3D joints"';
        return '<div class="rm-views">' +
          '<button class="rm-view' + (cur === '3d' ? ' is-active' : '') +
          '" type="button" data-view="3d"' + off + '>3D egocentric trajectories <span class="rm-view-tag">(interactive)</span></button>' +
          '<button class="rm-view' + (cur === '2d' ? ' is-active' : '') +
          '" type="button" data-view="2d">2D camera-frame trajectories</button>' +
          '</div>';
      }

      el.innerHTML =
        '<div class="rm-picker" role="tablist" aria-label="Query clips"></div>' +
        '<div class="rm-body"></div>';

      var picker = el.querySelector('.rm-picker');
      var body = el.querySelector('.rm-body');

      picker.innerHTML = queries.map(function (q, i) {
        return '<button class="rm-tab' + (i === 0 ? ' is-active' : '') + '" type="button" ' +
          'role="tab" data-idx="' + i + '">Query ' + (i + 1) + '</button>';
      }).join('');

      function clipCell(id, rank) {
        var rec = traj[id] || { w: 16, h: 9 };
        var ar = 'aspect-ratio:' + rec.w + '/' + rec.h + ';';
        return '<figure class="rm-clip" data-id="' + esc(id) + '">' +
          '<div class="rm-media">' +
          '<div class="rm-slot"><div class="rm-pane" style="' + ar + '">' +
          (rank ? '<span class="rm-rank">#' + rank + '</span>' : '') +
          '<video muted loop playsinline preload="metadata" data-src="' +
          videoDir + '/' + esc(id) + '.mp4"></video></div></div>' +
          '<div class="rm-slot"><div class="rm-pane rm-traj" style="' + ar + '">' +
          // Only in 3D -- on a 2D panel the invitation would be a lie.
          '<span class="rm-hint">Click and drag</span>' +
          '<canvas></canvas></div></div>' +
          '</div>' +
          '</figure>';
      }

      function mount(root) {
        root.querySelectorAll('.rm-clip').forEach(function (fig) {
          var rec = traj[fig.dataset.id];
          var video = fig.querySelector('video');
          var canvas = fig.querySelector('canvas');
          if (!rec || !video || !canvas) return;
          loadVideo(video);
          live.push({ video: video, canvas: canvas, rec: rec });
          fig.querySelector('.rm-traj').classList.toggle('is-3d', effView(rec) === '3d');
          paint(live[live.length - 1], 1);   // full trail until playback starts
        });
      }

      // Retrieval methods offered as a second row of tabs. "Ours" is always
      // present; a baseline only appears if the data file carries it.
      // `ref` is the entry number in the page's References section; the tab
      // shows it as plain text (a link inside the button would fight the click)
      // and the heading below carries the real anchor.
      var METHODS = [
        { key: 'ours', label: 'RoboTok' },
        { key: 'flow', label: 'Flow (CoRL 2024)', ref: 3, refId: 'ref-flow' },
        { key: 'hand', label: 'HAND (ICRA 2026)', ref: 4, refId: 'ref-hand' },
        { key: 'strap', label: 'STRAP (ICLR 2025)', ref: 5, refId: 'ref-strap' }
      ];
      var qIdx = 0, method = 'ours';

      function methodsFor(q) {
        var m = q.methods || { ours: q.retrieved || [] };
        return METHODS.filter(function (x) { return (m[x.key] || []).length; });
      }

      function resultsHead() {
        if (method === 'ours') {
          return 'Nearest neighbors in the corpus retrieved by the RoboTok model';
        }
        var m = METHODS.filter(function (x) { return x.key === method; })[0] || {};
        var cite = m.ref
          ? ' <a class="cite" href="#' + m.refId + '">[' + m.ref + ']</a>'
          : '';
        return 'Nearest neighbors in the corpus retrieved by ' + esc(m.label) + cite;
      }

      function select(i, m) {
        var q = queries[i];
        if (!q) return;
        qIdx = i;
        var avail = methodsFor(q);
        var keys = avail.map(function (x) { return x.key; });
        // Keep the chosen method across queries where it exists.
        method = keys.indexOf(m || method) >= 0 ? (m || method) : keys[0];
        live = [];

        picker.querySelectorAll('.rm-tab').forEach(function (b) {
          b.classList.toggle('is-active', b.dataset.idx === String(i));
        });

        var rows = (q.methods && q.methods[method]) || q.retrieved || [];
        var tabs = avail.map(function (x) {
          var tag = x.ref ? '<span class="cite-tag">[' + x.ref + ']</span>' : '';
          return '<button class="rm-method' + (x.key === method ? ' is-active' : '') +
            '" type="button" data-method="' + x.key + '">' + esc(x.label) + tag + '</button>';
        }).join('');

        body.innerHTML =
          '<div class="rm-query">' +
          '<div class="rm-query-head"><span class="rm-badge">Query</span>' +
          viewTabs(traj[q.id]) + '</div>' +
          clipCell(q.id, 0) +
          legendHtml(traj[q.id]) +
          '</div>' +
          '<div class="rm-results">' +
          (avail.length > 1 ? '<div class="rm-methods" role="tablist">' + tabs + '</div>' : '') +
          '<div class="rm-results-head">' + resultsHead() + '</div>' +
          '<div class="rm-grid">' +
          rows.map(function (r) { return clipCell(r.id, r.rank); }).join('') +
          '</div></div>';
        mount(body);
      }

      picker.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.rm-tab') : null;
        if (b) select(parseInt(b.dataset.idx, 10), method);
      });

      body.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.rm-method') : null;
        if (b) select(qIdx, b.dataset.method);
      });

      // Switching frame repaints the query canvas on the next tick -- it must
      // not rebuild the body, or the clip would reload and lose the playhead.
      body.addEventListener('click', function (e) {
        var v = e.target.closest ? e.target.closest('.rm-view') : null;
        if (!v || v.disabled || v.dataset.view === qView) return;
        qView = v.dataset.view;
        var rec = traj[queries[qIdx].id];
        var cur = effView(rec);
        body.querySelectorAll('.rm-view').forEach(function (b) {
          b.classList.toggle('is-active', b.dataset.view === cur);
        });
        var cap = body.querySelector('.rm-caveat');
        if (cap) cap.innerHTML = CAVEAT[cur];
        live.forEach(function (c) {
          var pane = c.canvas.parentNode;
          if (pane) pane.classList.toggle('is-3d', effView(c.rec) === '3d');
        });
      });

      // Left button orbits, right button pans, from any 3D panel: view3d is
      // shared, so dragging one moves the query and all nine neighbours to the
      // same viewpoint, which is the only way the comparison means anything.
      // Tracked on window rather than the canvas so a fast drag that leaves the
      // panel keeps going instead of sticking.
      body.addEventListener('pointerdown', function (e) {
        var pane = e.target.closest ? e.target.closest('.rm-traj.is-3d') : null;
        if (!pane || (e.button !== 0 && e.button !== 2)) return;
        e.preventDefault();
        var pan = e.button === 2;
        var x0 = e.clientX, y0 = e.clientY;
        var az0 = view3d.az, el0 = view3d.el, tx0 = view3d.tx, ty0 = view3d.ty;
        // Pan is in units of the dragged panel's short side, so the panel under
        // the cursor tracks it one for one.
        var m = Math.min(pane.clientWidth, pane.clientHeight) || 1;
        pane.classList.add(pan ? 'is-panning' : 'is-dragging');
        function move(ev) {
          var dx = ev.clientX - x0, dy = ev.clientY - y0;
          if (pan) {
            // Clamped: panned far enough out the scene leaves every panel at
            // once and there is nothing left to grab to bring it back.
            view3d.tx = Math.max(-1.2, Math.min(1.2, tx0 + dx / m));
            view3d.ty = Math.max(-1.2, Math.min(1.2, ty0 + dy / m));
          } else {
            view3d.az = az0 + dx * 0.011;
            // Clamped short of the poles: past vertical the scene flips over
            // and the axis labels read upside down.
            view3d.el = Math.max(-1.35, Math.min(1.35, el0 + dy * 0.011));
          }
        }
        function up() {
          pane.classList.remove('is-dragging');
          pane.classList.remove('is-panning');
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        }
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });

      // Right-dragging a panel must not also open the page's context menu.
      body.addEventListener('contextmenu', function (e) {
        if (e.target.closest && e.target.closest('.rm-traj.is-3d')) e.preventDefault();
      });

      // Double-click anywhere on a 3D panel puts every view back, which is the
      // way out of a pan or a tumble that has lost the hands.
      body.addEventListener('dblclick', function (e) {
        if (!(e.target.closest && e.target.closest('.rm-traj.is-3d'))) return;
        view3d.az = VIEW3D_HOME.az; view3d.el = VIEW3D_HOME.el;
        view3d.tx = VIEW3D_HOME.tx; view3d.ty = VIEW3D_HOME.ty;
      });

      // The toggle moves the query and its neighbours together -- comparing a
      // query against results drawn in a different frame would be meaningless.
      // A clip with no depth-grounded joints stays 2D on its own (effView).
      function paint(c, p) {
        if (effView(c.rec) === '3d') draw3d(c.canvas, c.rec, p);
        else drawTrajectory(c.canvas, c.rec, p);
      }

      // One loop for every panel: each canvas follows its own video's clock.
      function tick() {
        live.forEach(function (c) {
          var d = c.video.duration;
          var p = (d && isFinite(d) && d > 0) ? (c.video.currentTime / d) : 1;
          paint(c, p);
        });
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);

      select(0);
    }

    function load() {
      fetch(srcUrl, { cache: 'force-cache' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(start)
        .catch(function (err) {
          el.innerHTML = '<div class="media-missing" style="aspect-ratio:5/1">' +
            '<strong>retrieval data unavailable</strong><code>' + esc(srcUrl) + '</code>' +
            '<span style="font-size:.78rem">' + esc(err.message) + '</span></div>';
        });
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { load(); io.disconnect(); }
        });
      }, { rootMargin: '300px 0px' });
      io.observe(el);
    } else {
      load();
    }
  }

  /* ---------------------------------------------------------
     Sidebar rail: fade in past the header + active-section tracking
     --------------------------------------------------------- */
  function initNav() {
    var nav = document.getElementById('sidebar-nav');
    var links = Array.prototype.slice.call(document.querySelectorAll('.sidebar-nav a[href^="#"]'));
    if (!nav || !links.length) return;

    // Show the rail only once the reader has scrolled past the title block.
    var header = document.querySelector('.paper-header');
    function toggleNav() {
      var threshold = header ? header.offsetHeight * 0.6 : 300;
      nav.classList.toggle('is-visible', window.scrollY > threshold);
    }
    window.addEventListener('scroll', toggleNav, { passive: true });
    window.addEventListener('resize', toggleNav);
    toggleNav();

    var sections = links
      .map(function (a) { return document.querySelector(a.getAttribute('href')); })
      .filter(Boolean);
    if (!sections.length) return;

    /* Active = the last section whose top has crossed a line a quarter of the
       way down the viewport. Position-based rather than intersection-based, so
       a section taller than the viewport still tracks correctly. */
    function updateActive() {
      var line = window.scrollY + window.innerHeight * 0.25;
      var current = sections[0];
      sections.forEach(function (s) {
        if (s.offsetTop <= line) current = s;
      });
      // At the very bottom, the last section can never reach the line.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        current = sections[sections.length - 1];
      }
      links.forEach(function (a) {
        a.classList.toggle('is-active', a.getAttribute('href') === '#' + current.id);
        a.classList.remove('is-active-parent');
      });
      /* A grouped entry wraps sections that each have their own link, so the
         group's own anchor can never win on its own -- it shares an offsetTop
         with its first child. Light it up whenever a child is active, so the
         rail still shows which group the reader is in. */
      var active = nav.querySelector('.nav-sub a.is-active');
      if (active) {
        var parentLi = active.closest('.nav-sub').parentElement;
        var parentLink = parentLi && parentLi.querySelector(':scope > a');
        if (parentLink) parentLink.classList.add('is-active-parent');
      }
    }
    window.addEventListener('scroll', updateActive, { passive: true });
    window.addEventListener('resize', updateActive);
    updateActive();
  }

  /* ---------------------------------------------------------
     Boot
     --------------------------------------------------------- */
  function init() {
    // Each step is isolated: one section throwing (a missing data file, an API
    // the browser lacks) must not take down every section built after it --
    // including the video registration at the end, which the whole page needs.
    function safe(label, fn) {
      try { fn(); } catch (err) { console.error('[RoboTok] ' + label + ' failed:', err); }
    }
    safe('rollout galleries', function () {
      document.querySelectorAll('.rollout-gallery').forEach(buildGallery);
    });
    safe('sim grids', function () {
      document.querySelectorAll('.sim-grid-block').forEach(buildSimGrid);
    });
    safe('corpus zoom', function () {
      document.querySelectorAll('.corpus-zoom').forEach(buildCorpusZoom);
    });
    safe('retrieval mini', function () {
      document.querySelectorAll('.retrieval-mini').forEach(buildRetrievalMini);
    });
    safe('replay buttons', initReplayButtons);
    safe('nav', initNav);
    safe('videos', function () { registerVideos(document); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
