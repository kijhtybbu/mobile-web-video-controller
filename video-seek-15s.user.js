// ==UserScript==
// @name         移动端网页视频 ±15 秒快进快退插件 (Mobile Web Video Controller)
// @name:en      Mobile Web Video Controller (±15s Seek & 2X Speed)
// @namespace    https://github.com/kijhtybbu/mobile-web-video-controller
// @version      1.1.0
// @description  为移动端网页视频添加 ±15s 按钮、双击快进快退与长按2倍速功能，避开原生进度条并防止手势事件泄露
// @description:en Add ±15s seek buttons, double-tap gestures, and hold-for-2x speed to mobile web video players with full touch isolation.
// @author       kijhtybbu
// @match        *://*/*
// @run-at       document-end
// @allFrames    true
// @grant        none
// @homepageURL  https://github.com/kijhtybbu/mobile-web-video-controller
// @updateURL    https://raw.githubusercontent.com/kijhtybbu/mobile-web-video-controller/master/video-seek-15s.user.js
// @downloadURL  https://raw.githubusercontent.com/kijhtybbu/mobile-web-video-controller/master/video-seek-15s.user.js
// ==/UserScript==

(function () {
  'use strict';

  const SEEK_STEP = 15; // 跳转秒数
  const DOUBLE_TAP_DELAY = 300; // 双击判定间隔(ms)
  const AUTO_HIDE_DELAY = 3000; // 无操作自动隐藏(ms)
  const LONG_PRESS_DELAY = 350; // 长按触发2倍速阈值(ms)

  // 避免对同一个 video 重复挂载
  const processedVideos = new WeakSet();

  function initPlayerController(video) {
    if (processedVideos.has(video)) return;
    processedVideos.add(video);

    // 创建宿主节点
    const host = document.createElement('div');
    host.className = 'seek-extension-host';
    host.style.position = 'absolute';
    host.style.inset = '0';
    host.style.pointerEvents = 'none';
    host.style.zIndex = '2147483647'; // 最高层级

    const shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }
        .overlay-container {
          position: absolute;
          inset: 0;
          display: flex;
          justify-content: space-between;
          align-items: center; /* 垂直居中，使上下两端留出空间 */
          pointer-events: none;
          box-sizing: border-box;
          user-select: none;
          -webkit-user-select: none;
        }
        /* 左右两侧 35% 响应区域，缩小高度至 55%，避开底部进度条与顶部标题栏 */
        .touch-zone {
          width: 35%;
          height: 55%;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: auto;
          position: relative;
          -webkit-tap-highlight-color: transparent;
        }
        /* 中间留空 30%，透传点击给原生网页播放器 */
        .spacer {
          width: 30%;
          height: 100%;
          pointer-events: none;
        }
        /* 悬浮按钮：加大尺寸至 60px，只保留纯文本 */
        .seek-btn {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          border: 1.5px solid rgba(255, 255, 255, 0.35);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.5px;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.3s ease, transform 0.12s ease;
          pointer-events: auto;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          user-select: none;
          -webkit-user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        .seek-btn:active {
          transform: scale(0.92);
          background: rgba(0, 0, 0, 0.8);
        }
        .show-ui .seek-btn {
          opacity: 1;
        }

        /* 顶部 2 倍速快进 HUD 提示 */
        .speed-indicator {
          position: absolute;
          top: 14%;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          color: #ffcc00;
          padding: 6px 16px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: bold;
          letter-spacing: 0.5px;
          display: none;
          pointer-events: none;
          border: 1px solid rgba(255, 204, 0, 0.3);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
          z-index: 100;
          white-space: nowrap;
        }
        .speed-indicator.active {
          display: block;
        }
      </style>
      <div class="overlay-container">
        <!-- 2倍速 HUD 提示 -->
        <div class="speed-indicator" id="speed-indicator">▶▶ 2.0X 快进中</div>

        <!-- 快退区域 -->
        <div class="touch-zone left-zone">
          <div class="seek-btn" id="rewind-btn" title="后退 15 秒">-15</div>
        </div>

        <!-- 中间透传区域 -->
        <div class="spacer"></div>

        <!-- 快进区域 -->
        <div class="touch-zone right-zone">
          <div class="seek-btn" id="forward-btn" title="快进 15 秒">+15</div>
        </div>
      </div>
    `;

    // 挂载节点到 video 的父容器
    function attachHost() {
      const parent = video.parentElement;
      if (parent) {
        const computedStyle = window.getComputedStyle(parent);
        if (computedStyle.position === 'static') {
          parent.style.position = 'relative';
        }
        if (!parent.contains(host)) {
          parent.appendChild(host);
        }
      }
    }
    attachHost();

    // 全屏切换自适应挂载
    const handleFullscreenChange = () => {
      const fsElem = document.fullscreenElement || document.webkitFullscreenElement;
      if (fsElem && (fsElem === video || fsElem.contains(video))) {
        fsElem.appendChild(host);
      } else {
        attachHost();
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    // 阻止指定事件向上冒泡泄漏给底层原生播放器，彻底解决双击或点击被原生播放器接收的问题
    const stopLeakEvents = ['click', 'dblclick', 'mousedown', 'mouseup', 'contextmenu'];
    stopLeakEvents.forEach((evtName) => {
      host.addEventListener(evtName, (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }, true);
    });

    // 元素获取
    const container = shadow.querySelector('.overlay-container');
    const rewindBtn = shadow.querySelector('#rewind-btn');
    const forwardBtn = shadow.querySelector('#forward-btn');
    const leftZone = shadow.querySelector('.left-zone');
    const rightZone = shadow.querySelector('.right-zone');
    const speedIndicator = shadow.querySelector('#speed-indicator');

    let hideTimer = null;
    function showUI() {
      container.classList.add('show-ui');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        container.classList.remove('show-ui');
      }, AUTO_HIDE_DELAY);
    }

    function triggerSeek(seconds) {
      if (!isNaN(video.duration)) {
        video.currentTime = Math.min(Math.max(video.currentTime + seconds, 0), video.duration);
      }
      showUI();
    }

    // 2 倍速逻辑
    let savedRate = 1.0;
    let isSpeeding = false;
    let speedHoldTimer = null;

    function startSpeedUp() {
      if (isSpeeding) return;
      isSpeeding = true;
      savedRate = video.playbackRate || 1.0;
      video.playbackRate = 2.0;
      speedIndicator.classList.add('active');
    }

    function stopSpeedUp() {
      if (!isSpeeding) return;
      video.playbackRate = savedRate;
      isSpeeding = false;
      speedIndicator.classList.remove('active');
    }

    // 统一触摸与手势监听（支持双击跳转、按住2倍速、点击按钮）
    let isTouching = false;
    const markTouch = () => {
      isTouching = true;
      setTimeout(() => { isTouching = false; }, 400);
    };

    // 绑定左侧区域（后退 15s）
    let leftLastTap = 0;
    let leftTapTimer = null;

    leftZone.addEventListener('touchstart', (e) => {
      markTouch();
      e.stopPropagation();
    }, { passive: false });

    leftZone.addEventListener('touchend', (e) => {
      e.stopPropagation();
      e.preventDefault(); // 阻止浏览器合成鼠标事件，防止播放器接收到 dblclick

      const isBtn = e.target.closest('#rewind-btn');
      if (isBtn) {
        // 直接点击了 -15 按钮
        triggerSeek(-SEEK_STEP);
        return;
      }

      // 点击了左侧屏幕区域
      const now = Date.now();
      if (now - leftLastTap < DOUBLE_TAP_DELAY && now - leftLastTap > 0) {
        clearTimeout(leftTapTimer);
        leftLastTap = 0;
        triggerSeek(-SEEK_STEP);
      } else {
        leftLastTap = now;
        leftTapTimer = setTimeout(() => {
          showUI();
          leftLastTap = 0;
        }, DOUBLE_TAP_DELAY);
      }
    }, { passive: false });

    // 绑定右侧区域（前进 15s + 按住 2 倍速）
    let rightLastTap = 0;
    let rightTapTimer = null;

    rightZone.addEventListener('touchstart', (e) => {
      markTouch();
      e.stopPropagation();

      // 按住 350ms 触发 2 倍速
      speedHoldTimer = setTimeout(() => {
        startSpeedUp();
      }, LONG_PRESS_DELAY);
    }, { passive: false });

    const handleRightRelease = (e) => {
      e.stopPropagation();
      clearTimeout(speedHoldTimer);

      if (isSpeeding) {
        // 如果触发了 2 倍速，松手时恢复倍速，不触发跳转
        stopSpeedUp();
        e.preventDefault();
        return;
      }

      e.preventDefault(); // 阻止事件泄漏合成 dblclick

      const isBtn = e.target.closest('#forward-btn');
      if (isBtn) {
        // 直接点击了 +15 按钮
        triggerSeek(SEEK_STEP);
        return;
      }

      // 点击了右侧屏幕区域
      const now = Date.now();
      if (now - rightLastTap < DOUBLE_TAP_DELAY && now - rightLastTap > 0) {
        clearTimeout(rightTapTimer);
        rightLastTap = 0;
        triggerSeek(SEEK_STEP);
      } else {
        rightLastTap = now;
        rightTapTimer = setTimeout(() => {
          showUI();
          rightLastTap = 0;
        }, DOUBLE_TAP_DELAY);
      }
    };

    rightZone.addEventListener('touchend', handleRightRelease, { passive: false });
    rightZone.addEventListener('touchcancel', (e) => {
      clearTimeout(speedHoldTimer);
      if (isSpeeding) stopSpeedUp();
    }, { passive: false });

    // 兼容桌面鼠标调试
    rewindBtn.addEventListener('click', (e) => {
      if (isTouching) return;
      e.stopPropagation();
      e.preventDefault();
      triggerSeek(-SEEK_STEP);
    });
    forwardBtn.addEventListener('click', (e) => {
      if (isTouching) return;
      e.stopPropagation();
      e.preventDefault();
      triggerSeek(SEEK_STEP);
    });
  }

  // 页面动态扫描检测视频
  function scanVideos() {
    const videos = document.querySelectorAll('video');
    videos.forEach((video) => initPlayerController(video));
  }

  scanVideos();
  const observer = new MutationObserver(() => scanVideos());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
