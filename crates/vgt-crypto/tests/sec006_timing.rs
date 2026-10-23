use std::time::Instant;
use vgt_crypto::constant_time_eq;

fn normal_cdf(x: f64) -> f64 {
    let sign = if x < 0.0 { -1.0 } else { 1.0 };
    let x = x.abs() / 2.0_f64.sqrt();
    let t = 1.0 / (1.0 + 0.3275911 * x);
    let a1 = 0.254829592;
    let a2 = -0.284496736;
    let a3 = 1.421413741;
    let a4 = -1.453152027;
    let a5 = 1.061405429;
    let erf = sign * (1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * (-x * x).exp());
    0.5 * (1.0 + erf)
}

fn stats(xs: &[f64]) -> (f64, f64) {
    let n = xs.len() as f64;
    let mean = xs.iter().sum::<f64>() / n;
    let var = xs.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n - 1.0);
    (mean, var)
}

#[test]
fn sec006_early_vs_late_mismatch_has_no_detectable_timing_split() {
    const SAMPLES: usize = 3000;
    const INNER: usize = 512;
    let base = [0x5au8; 256];
    let mut early = base;
    let mut late = base;
    early[0] ^= 1;
    late[255] ^= 1;
    let mut a = Vec::with_capacity(SAMPLES);
    let mut b = Vec::with_capacity(SAMPLES);
    for i in 0..SAMPLES {
        let (first, second) = if i & 1 == 0 {
            (&early, &late)
        } else {
            (&late, &early)
        };
        let t0 = Instant::now();
        for _ in 0..INNER {
            std::hint::black_box(constant_time_eq(&base, first));
        }
        a.push(t0.elapsed().as_nanos() as f64);
        let t1 = Instant::now();
        for _ in 0..INNER {
            std::hint::black_box(constant_time_eq(&base, second));
        }
        b.push(t1.elapsed().as_nanos() as f64);
    }
    let (ma, va) = stats(&a);
    let (mb, vb) = stats(&b);
    let denom = (va / SAMPLES as f64 + vb / SAMPLES as f64).sqrt();
    let t = if denom == 0.0 { 0.0 } else { (ma - mb) / denom };
    let p = 2.0 * (1.0 - normal_cdf(t.abs()));
    eprintln!("SEC006_TIMING early_mean_ns={ma:.2} late_mean_ns={mb:.2} welch_t={t:.4} p_normal_approx={p:.6}");
    assert!(p > 0.05, "detectable early/late timing split: p={p}");
}
