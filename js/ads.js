export function initAds() {
  showBannerAd('ad-main-menu-banner');
  showBannerAd('ad-game-over-banner');
}

export function showBannerAd(slotId) {
  const slot = document.getElementById(slotId);
  console.log('Banner ad placeholder:', slotId);
  if (!slot) return;
  // Insert Google AdSense or another banner SDK render call here later.
  slot.classList.add('ad-placeholder');
  slot.setAttribute('aria-label', 'Advertisement');
  if (!slot.textContent.trim()) {
    slot.innerHTML = '<span>Advertisement</span><small>Ad Space</small>';
  }
}

export function showRewardedAd(onReward) {
  // Insert rewarded ad SDK logic here later. For now, immediately resolve.
  console.log('Rewarded ad placeholder');
  if (typeof onReward === 'function') onReward();
}
