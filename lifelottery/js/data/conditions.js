// Chronic conditions a life can acquire (state.conditions holds the ids).
//
//   health / happiness  per-year drag applied to the *target* of those stats while the condition lasts
//   risk                multiplier on the annual death probability (before access-to-care scaling)
//   onset               annual onset hazard by age band; scaled by systems.js for smoking, wealth, etc.
//   curable             if true, systems may remove it (e.g. depression remits)

export const CONDITIONS = {
  hypertension: { label: '高血壓', health: -4, happiness: 0, risk: 1.25, onset: [[35, 49, 0.012], [50, 69, 0.03], [70, 120, 0.04]] },
  diabetes: { label: '糖尿病', health: -7, happiness: -2, risk: 1.6, onset: [[30, 49, 0.006], [50, 69, 0.014], [70, 120, 0.012]] },
  heart_disease: { label: '心臟病', health: -12, happiness: -3, risk: 2.2, onset: [[40, 59, 0.004], [60, 120, 0.014]] },
  copd: { label: '慢性肺病', health: -10, happiness: -3, risk: 1.8, onset: [[45, 120, 0.004]], smokerOnly: true },
  cancer: { label: '癌症', health: -18, happiness: -6, risk: 2.8, onset: [[30, 49, 0.0018], [50, 69, 0.0055], [70, 120, 0.009]] },
  depression: { label: '憂鬱症', health: -3, happiness: -10, risk: 1.2, onset: [[13, 24, 0.008], [25, 64, 0.006], [65, 120, 0.006]], curable: true },
  asthma: { label: '氣喘', health: -3, happiness: -1, risk: 1.1, onset: [[1, 12, 0.012], [13, 40, 0.002]] },
  arthritis: { label: '關節炎', health: -4, happiness: -2, risk: 1.05, onset: [[45, 64, 0.008], [65, 120, 0.02]] },
  dementia: { label: '失智症', health: -10, happiness: -6, risk: 2.5, onset: [[70, 79, 0.01], [80, 89, 0.03], [90, 120, 0.05]] },
  disability: { label: '身心障礙', health: -6, happiness: -3, risk: 1.3, onset: [[0, 120, 0.0008]] },
  hiv: { label: '愛滋病病毒感染', health: -8, happiness: -4, risk: 2.0, onset: [] }, // only via events / region-specific onset
  alcohol: { label: '酒精依賴', health: -6, happiness: -4, risk: 1.5, onset: [[20, 64, 0.0015]], curable: true },
};

export const CONDITION_IDS = Object.keys(CONDITIONS);
