# SiLEnSeSS rendering benchmark report

Generated 2026-10-20T13:05:54.053Z from 1 result file(s) by `benchmarks/scripts/aggregate.ts`.
Values are medians over repetitions. **Headline: mean FPS** (frames delivered / measured seconds); **Pass** = mean FPS strictly greater than 30 (OE3). The median is quantized by vsync (refresh / n) and is kept as a secondary column; *1% low* = 1000 / p99 frame time. GPU memory is an **estimate** from buffer sizes, not a measurement.

## ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11) · 24 threads · Windows · Microsoft Edge 155

- GPU: ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11) (Google Inc. (NVIDIA))
- GPU used by the canvas: not recorded (schema v1)
- CPU threads: 24 · device memory: 32 GB (browser-capped)
- Browser: Microsoft Edge 155.0.4283.45 · platform: Windows
- Screen: 2560x1440 @ DPR 1.5 · refresh ≈ 165 Hz
- Builds: 2.0.13 (ed59e82fc358, dirty) · schema version(s): 1
- Files: `bench-2026-10-20T02-55-56-mainpc.json`

Warnings recorded during the run:

- `bench-2026-10-20T02-55-56-mainpc.json`: Tab hidden at 2026-10-20T02:56:04.714Z during n10000-d2-r1 (settle): frames were throttled.

### Frame rate by size × density × phase (baseline canvas)

| Source | Agents | Density | Links | Entities | Phase | Reps | **Mean FPS** | 1% low | p5 FPS | Median FPS | Frames > 33.3 ms | Heap max (MB) | GPU est. (MB) | Mean > 30 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| synthetic | 10,000 | 2 | 39,994 | 49,994 | layout | 3 | 147.0 | 161.3 | 161.3 | 163.9 | 0.3 % | 1369 | 55 | n/c¹ |
| synthetic | 10,000 | 2 | 39,994 | 49,994 | idle | 3 | 165.0 | 161.3 | 163.9 | 163.9 | 0.0 % | 1518 | 55 | PASS |
| synthetic | 10,000 | 2 | 39,994 | 49,994 | interaction | 3 | 164.9 | 161.3 | 163.9 | 163.9 | 0.0 % | 1513 | 55 | PASS |
| synthetic | 10,000 | 2 | 39,994 | 49,994 | repaint (x1) | 3 | 164.5 | 161.3 | 161.3 | 163.9 | 0.0 % | 2124 | 55 | PASS |
| synthetic | 10,000 | 2 | 39,994 | 49,994 | repaint (x16) | 3 | 112.5 | 41.1 | 55.0 | 163.9 | 0.2 % | 663 | 55 | PASS |
| synthetic | 10,000 | 2 | 39,994 | 49,994 | cluster-layout (strategy) | 3 | 157.4 | 82.6 | 161.3 | 163.9 | 0.1 % | 622 | 55 | n/c¹ |
| synthetic | 10,000 | 2 | 39,994 | 49,994 | cluster-idle (strategy) | 3 | 165.0 | 161.3 | 161.3 | 163.9 | 0.0 % | 606 | 55 | PASS |
| synthetic | 10,000 | 2 | 39,994 | 49,994 | cluster-interaction (strategy) | 3 | 165.0 | 161.3 | 163.9 | 163.9 | 0.0 % | 282 | 55 | PASS |
| synthetic | 10,000 | 3 | 59,988 | 69,988 | layout | 3 | 139.7 | 82.0 | 82.6 | 163.9 | 0.3 % | 523 | 57 | n/c¹ |
| synthetic | 10,000 | 3 | 59,988 | 69,988 | idle | 3 | 164.5 | 161.3 | 161.3 | 163.9 | 0.0 % | 581 | 57 | PASS |
| synthetic | 10,000 | 3 | 59,988 | 69,988 | interaction | 3 | 165.0 | 161.3 | 163.9 | 163.9 | 0.0 % | 118 | 57 | PASS |
| synthetic | 10,000 | 3 | 59,988 | 69,988 | repaint (x1) | 3 | 165.0 | 161.3 | 163.9 | 163.9 | 0.0 % | 203 | 57 | PASS |
| synthetic | 10,000 | 3 | 59,988 | 69,988 | repaint (x16) | 3 | 102.0 | 41.1 | 54.6 | 163.9 | 0.4 % | 288 | 57 | PASS |
| synthetic | 10,000 | 3 | 59,988 | 69,988 | cluster-layout (strategy) | 3 | 159.2 | 161.3 | 161.3 | 163.9 | 0.1 % | 304 | 57 | n/c¹ |
| synthetic | 10,000 | 3 | 59,988 | 69,988 | cluster-idle (strategy) | 3 | 165.0 | 161.3 | 161.3 | 163.9 | 0.0 % | 282 | 57 | PASS |
| synthetic | 10,000 | 3 | 59,988 | 69,988 | cluster-interaction (strategy) | 3 | 164.9 | 161.3 | 163.9 | 163.9 | 0.0 % | 169 | 57 | PASS |
| synthetic | 10,000 | 5 | 99,970 | 109,970 | layout | 3 | 107.3 | 55.0 | 82.0 | 163.9 | 0.5 % | 512 | 63 | n/c¹ |
| synthetic | 10,000 | 5 | 99,970 | 109,970 | idle | 3 | 144.0 | 82.0 | 82.6 | 163.9 | 0.0 % | 668 | 63 | PASS |
| synthetic | 10,000 | 5 | 99,970 | 109,970 | interaction | 3 | 153.7 | 82.0 | 82.6 | 163.9 | 0.0 % | 106 | 63 | PASS |
| synthetic | 10,000 | 5 | 99,970 | 109,970 | repaint (x1) | 3 | 165.0 | 161.3 | 163.9 | 163.9 | 0.0 % | 281 | 63 | PASS |
| synthetic | 10,000 | 5 | 99,970 | 109,970 | repaint (x16) | 3 | 87.8 | 33.0 | 41.1 | 83.3 | 0.7 % | 346 | 63 | PASS |
| synthetic | 10,000 | 5 | 99,970 | 109,970 | cluster-layout (strategy) | 3 | 156.3 | 82.6 | 161.3 | 163.9 | 0.1 % | 307 | 63 | n/c¹ |
| synthetic | 10,000 | 5 | 99,970 | 109,970 | cluster-idle (strategy) | 3 | 165.0 | 161.3 | 163.9 | 163.9 | 0.0 % | 293 | 63 | PASS |
| synthetic | 10,000 | 5 | 99,970 | 109,970 | cluster-interaction (strategy) | 3 | 147.3 | 55.0 | 82.6 | 163.9 | 0.0 % | 290 | 63 | PASS |
| synthetic | 25,000 | 2 | 99,994 | 124,994 | layout | 3 | 102.9 | 55.0 | 82.0 | 163.9 | 0.4 % | 574 | 65 | n/c¹ |
| synthetic | 25,000 | 2 | 99,994 | 124,994 | idle | 3 | 135.7 | 82.0 | 82.0 | 163.9 | 0.0 % | 682 | 65 | PASS |
| synthetic | 25,000 | 2 | 99,994 | 124,994 | interaction | 3 | 165.0 | 161.3 | 161.3 | 163.9 | 0.0 % | 119 | 65 | PASS |
| synthetic | 25,000 | 2 | 99,994 | 124,994 | repaint (x1) | 3 | 156.4 | 55.3 | 161.3 | 163.9 | 0.0 % | 292 | 65 | PASS |
| synthetic | 25,000 | 2 | 99,994 | 124,994 | repaint (x16) | 3 | 51.7 | 18.3 | 27.5 | 55.0 | 8.5 % | 403 | 65 | PASS |
| synthetic | 25,000 | 2 | 99,994 | 124,994 | cluster-layout (strategy) | 3 | 131.6 | 81.3 | 82.0 | 163.9 | 0.2 % | 378 | 65 | n/c¹ |
| synthetic | 25,000 | 2 | 99,994 | 124,994 | cluster-idle (strategy) | 3 | 156.8 | 82.0 | 83.3 | 163.9 | 0.0 % | 334 | 65 | PASS |
| synthetic | 25,000 | 2 | 99,994 | 124,994 | cluster-interaction (strategy) | 3 | 152.3 | 55.0 | 82.6 | 163.9 | 0.1 % | 150 | 65 | PASS |
| synthetic | 25,000 | 3 | 149,988 | 174,988 | layout | 3 | 82.5 | 33.3 | 55.0 | 82.6 | 0.9 % | 606 | 72 | n/c¹ |
| synthetic | 25,000 | 3 | 149,988 | 174,988 | idle | 3 | 92.8 | 81.3 | 82.0 | 82.6 | 0.0 % | 746 | 72 | PASS |
| synthetic | 25,000 | 3 | 149,988 | 174,988 | interaction | 3 | 153.1 | 82.0 | 82.6 | 163.9 | 0.1 % | 156 | 72 | PASS |
| synthetic | 25,000 | 3 | 149,988 | 174,988 | repaint (x1) | 3 | 151.5 | 55.0 | 82.6 | 163.9 | 0.0 % | 372 | 72 | PASS |
| synthetic | 25,000 | 3 | 149,988 | 174,988 | repaint (x16) | 3 | 44.7 | 16.5 | 20.7 | 55.0 | 12.8 % | 447 | 72 | PASS |
| synthetic | 25,000 | 3 | 149,988 | 174,988 | cluster-layout (strategy) | 3 | 129.2 | 81.3 | 82.0 | 163.9 | 0.3 % | 408 | 72 | n/c¹ |
| synthetic | 25,000 | 3 | 149,988 | 174,988 | cluster-idle (strategy) | 3 | 164.7 | 161.3 | 163.9 | 163.9 | 0.0 % | 234 | 72 | PASS |
| synthetic | 25,000 | 3 | 149,988 | 174,988 | cluster-interaction (strategy) | 3 | 136.5 | 41.3 | 82.0 | 163.9 | 0.2 % | 188 | 72 | PASS |
| synthetic | 25,000 | 5 | 249,970 | 274,970 | layout | 3 | 66.0 | 24.6 | 54.6 | 82.6 | 2.4 % | 643 | 85 | n/c¹ |
| synthetic | 25,000 | 5 | 249,970 | 274,970 | idle | 3 | 65.3 | 54.6 | 54.6 | 55.3 | 0.0 % | 904 | 85 | PASS |
| synthetic | 25,000 | 5 | 249,970 | 274,970 | interaction | 3 | 72.3 | 41.0 | 41.3 | 82.0 | 0.4 % | 281 | 85 | PASS |
| synthetic | 25,000 | 5 | 249,970 | 274,970 | repaint (x1) | 3 | 113.9 | 41.1 | 55.0 | 163.9 | 0.2 % | 556 | 85 | PASS |
| synthetic | 25,000 | 5 | 249,970 | 274,970 | repaint (x16) | 3 | 36.4 | 11.8 | 16.5 | 41.1 | 30.5 % | 535 | 85 | PASS |
| synthetic | 25,000 | 5 | 249,970 | 274,970 | cluster-layout (strategy) | 3 | 108.6 | 54.6 | 82.0 | 163.9 | 0.4 % | 455 | 85 | n/c¹ |
| synthetic | 25,000 | 5 | 249,970 | 274,970 | cluster-idle (strategy) | 3 | 164.5 | 161.3 | 161.3 | 163.9 | 0.0 % | 491 | 85 | PASS |
| synthetic | 25,000 | 5 | 249,970 | 274,970 | cluster-interaction (strategy) | 3 | 66.8 | 20.6 | 32.9 | 82.6 | 4.5 % | 192 | 85 | PASS |
| synthetic | 50,000 | 2 | 199,994 | 249,994 | layout | 3 | 66.9 | 19.1 | 54.6 | 82.6 | 2.4 % | 679 | 83 | n/c¹ |
| synthetic | 50,000 | 2 | 199,994 | 249,994 | idle | 3 | 70.4 | 54.6 | 55.0 | 82.0 | 0.1 % | 937 | 83 | PASS |
| synthetic | 50,000 | 2 | 199,994 | 249,994 | interaction | 3 | 126.8 | 55.0 | 82.0 | 163.9 | 0.1 % | 323 | 83 | PASS |
| synthetic | 50,000 | 2 | 199,994 | 249,994 | repaint (x1) | 3 | 125.8 | 27.5 | 41.1 | 163.9 | 1.1 % | 557 | 83 | PASS |
| synthetic | 50,000 | 2 | 199,994 | 249,994 | repaint (x16) | 3 | 24.4 | 8.3 | 9.7 | 23.6 | 60.2 % | 617 | 83 | FAIL |
| synthetic | 50,000 | 2 | 199,994 | 249,994 | cluster-layout (strategy) | 3 | 76.7 | 36.5 | 55.3 | 82.6 | 0.9 % | 509 | 83 | n/c¹ |
| synthetic | 50,000 | 2 | 199,994 | 249,994 | cluster-idle (strategy) | 3 | 120.2 | 81.3 | 82.0 | 163.9 | 0.0 % | 577 | 83 | PASS |
| synthetic | 50,000 | 2 | 199,994 | 249,994 | cluster-interaction (strategy) | 3 | 105.7 | 32.9 | 55.0 | 163.9 | 0.6 % | 257 | 83 | PASS |
| synthetic | 50,000 | 3 | 299,988 | 349,988 | layout | 3 | 56.6 | 17.6 | 41.1 | 55.3 | 2.5 % | 707 | 96 | n/c¹ |
| synthetic | 50,000 | 3 | 299,988 | 349,988 | idle | 3 | 51.7 | 41.1 | 41.1 | 55.0 | 0.0 % | 1011 | 96 | PASS |
| synthetic | 50,000 | 3 | 299,988 | 349,988 | interaction | 3 | 106.5 | 41.1 | 41.3 | 163.9 | 0.1 % | 400 | 96 | PASS |
| synthetic | 50,000 | 3 | 299,988 | 349,988 | repaint (x1) | 3 | 103.2 | 23.5 | 27.6 | 163.9 | 6.3 % | 616 | 96 | PASS |
| synthetic | 50,000 | 3 | 299,988 | 349,988 | repaint (x16) | 3 | 21.1 | 7.9 | 8.7 | 20.7 | 78.2 % | 706 | 96 | FAIL |
| synthetic | 50,000 | 3 | 299,988 | 349,988 | cluster-layout (strategy) | 3 | 65.3 | 27.4 | 54.6 | 82.6 | 1.3 % | 673 | 96 | n/c¹ |
| synthetic | 50,000 | 3 | 299,988 | 349,988 | cluster-idle (strategy) | 3 | 130.7 | 81.3 | 82.0 | 163.9 | 0.0 % | 670 | 96 | PASS |
| synthetic | 50,000 | 3 | 299,988 | 349,988 | cluster-interaction (strategy) | 3 | 85.7 | 20.6 | 33.1 | 163.9 | 3.7 % | 279 | 96 | PASS |
| synthetic | 50,000 | 5 | 499,970 | 549,970 | layout | 3 | 49.6 | 18.6 | 32.9 | 163.9 | 3.8 % | 874 | 123 | n/c¹ |
| synthetic | 50,000 | 5 | 499,970 | 549,970 | idle | 3 | 34.3 | 32.9 | 32.9 | 33.0 | 0.3 % | 1149 | 123 | PASS |
| synthetic | 50,000 | 5 | 499,970 | 549,970 | interaction | 3 | 36.4 | 23.5 | 23.6 | 33.2 | 20.4 % | 1272 | 123 | PASS |
| synthetic | 50,000 | 5 | 499,970 | 549,970 | repaint (x1) | 3 | 26.6 | 8.4 | 11.3 | 41.1 | 36.5 % | 862 | 123 | FAIL |
| synthetic | 50,000 | 5 | 499,970 | 549,970 | repaint (x16) | 3 | 14.0 | 5.5 | 6.6 | 16.5 | 69.7 % | 905 | 123 | FAIL |
| synthetic | 50,000 | 5 | 499,970 | 549,970 | cluster-layout (strategy) | 3 | 64.4 | 39.9 | 41.1 | 82.6 | 0.6 % | 956 | 123 | n/c¹ |
| synthetic | 50,000 | 5 | 499,970 | 549,970 | cluster-idle (strategy) | 3 | 112.0 | 81.3 | 82.0 | 161.3 | 0.0 % | 925 | 123 | PASS |
| synthetic | 50,000 | 5 | 499,970 | 549,970 | cluster-interaction (strategy) | 3 | 34.2 | 10.7 | 16.3 | 33.1 | 34.5 % | 377 | 123 | PASS |
| synthetic | 100,000 | 2 | 399,994 | 499,994 | layout | 3 | 50.1 | 17.4 | 32.9 | 163.9 | 3.6 % | 985 | 118 | n/c¹ |
| synthetic | 100,000 | 2 | 399,994 | 499,994 | idle | 3 | 38.5 | 32.9 | 32.9 | 41.1 | 0.3 % | 1250 | 118 | PASS |
| synthetic | 100,000 | 2 | 399,994 | 499,994 | interaction | 3 | 66.7 | 33.0 | 41.1 | 82.0 | 0.0 % | 480 | 118 | PASS |
| synthetic | 100,000 | 2 | 399,994 | 499,994 | repaint (x1) | 3 | 14.6 | 5.6 | 6.1 | 11.8 | 55.4 % | 1040 | 118 | FAIL |
| synthetic | 100,000 | 2 | 399,994 | 499,994 | repaint (x16) | 3 | 10.8 | 4.8 | 5.3 | 11.0 | 67.9 % | 1015 | 118 | FAIL |
| synthetic | 100,000 | 2 | 399,994 | 499,994 | cluster-layout (strategy) | 3 | 37.4 | 9.3 | 34.7 | 55.0 | 3.6 % | 909 | 118 | n/c¹ |
| synthetic | 100,000 | 2 | 399,994 | 499,994 | cluster-idle (strategy) | 3 | 58.5 | 41.3 | 54.6 | 55.0 | 0.0 % | 994 | 118 | PASS |
| synthetic | 100,000 | 2 | 399,994 | 499,994 | cluster-interaction (strategy) | 3 | 34.9 | 18.3 | 23.5 | 33.1 | 27.1 % | 495 | 118 | PASS |
| synthetic | 100,000 | 3 | 599,988 | 699,988 | layout | 3 | 45.5 | 12.8 | 23.6 | 163.9 | 26.9 % | 825 | 145 | n/c¹ |
| synthetic | 100,000 | 3 | 599,988 | 699,988 | idle | 3 | 28.0 | 23.6 | 27.4 | 27.5 | 89.0 % | 1351 | 145 | FAIL |
| synthetic | 100,000 | 3 | 599,988 | 699,988 | interaction | 3 | 40.3 | 20.6 | 23.5 | 41.3 | 18.9 % | 1425 | 145 | PASS |
| synthetic | 100,000 | 3 | 599,988 | 699,988 | repaint (x1) | 3 | 10.5 | 5.0 | 5.2 | 9.2 | 62.9 % | 1226 | 145 | FAIL |
| synthetic | 100,000 | 3 | 599,988 | 699,988 | repaint (x16) | 3 | 8.2 | 3.8 | 4.7 | 8.7 | 90.1 % | 1155 | 145 | FAIL |
| synthetic | 100,000 | 3 | 599,988 | 699,988 | cluster-layout (strategy) | 3 | 39.5 | 7.9 | 33.0 | 55.3 | 2.3 % | 1186 | 145 | n/c¹ |
| synthetic | 100,000 | 3 | 599,988 | 699,988 | cluster-idle (strategy) | 3 | 62.3 | 41.1 | 54.6 | 55.3 | 0.0 % | 1200 | 145 | PASS |
| synthetic | 100,000 | 3 | 599,988 | 699,988 | cluster-interaction (strategy) | 3 | 25.5 | 12.7 | 16.5 | 27.5 | 60.0 % | 691 | 145 | FAIL |
| synthetic | 100,000 | 5 | 999,970 | 1,099,970 | layout | 3 | 47.1 | 10.4 | 18.3 | 163.9 | 10.4 % | 1082 | 198 | n/c¹ |
| synthetic | 100,000 | 5 | 999,970 | 1,099,970 | idle | 3 | 18.6 | 16.5 | 18.3 | 18.4 | 100.0 % | 1291 | 198 | FAIL |
| synthetic | 100,000 | 5 | 999,970 | 1,099,970 | interaction | 3 | 22.2 | 11.8 | 12.7 | 23.6 | 68.0 % | 1704 | 198 | FAIL |
| synthetic | 100,000 | 5 | 999,970 | 1,099,970 | repaint (x1) | 3 | 6.9 | 3.6 | 4.0 | 6.6 | 100.0 % | 1663 | 198 | FAIL |
| synthetic | 100,000 | 5 | 999,970 | 1,099,970 | repaint (x16) | 3 | 7.0 | 3.6 | 4.6 | 7.2 | 100.0 % | 1683 | 198 | FAIL |
| synthetic | 100,000 | 5 | 999,970 | 1,099,970 | cluster-layout (strategy) | 3 | 5.6 | 1.1 | 4.0 | 7.2 | 100.0 % | 1636 | 198 | n/c¹ |
| synthetic | 100,000 | 5 | 999,970 | 1,099,970 | cluster-idle (strategy) | 3 | 57.0 | 41.1 | 41.1 | 55.0 | 0.2 % | 1508 | 198 | PASS |
| synthetic | 100,000 | 5 | 999,970 | 1,099,970 | cluster-interaction (strategy) | 3 | 16.7 | 7.6 | 11.0 | 16.5 | 81.4 % | 828 | 198 | FAIL |
| synthetic | 150,000 | 2 | 599,994 | 749,994 | layout | 3 | 45.9 | 11.4 | 23.5 | 163.9 | 21.6 % | 1032 | 153 | n/c¹ |
| synthetic | 150,000 | 2 | 599,994 | 749,994 | idle | 3 | 26.0 | 23.5 | 23.5 | 27.5 | 100.0 % | 1717 | 153 | FAIL |
| synthetic | 150,000 | 2 | 599,994 | 749,994 | interaction | 3 | 48.2 | 23.5 | 27.5 | 55.0 | 7.8 % | 668 | 153 | PASS |
| synthetic | 150,000 | 2 | 599,994 | 749,994 | repaint (x1) | 3 | 7.6 | 4.3 | 4.8 | 6.9 | 89.4 % | 1489 | 153 | FAIL |
| synthetic | 150,000 | 2 | 599,994 | 749,994 | repaint (x16) | 3 | 6.9 | 4.0 | 4.5 | 6.6 | 100.0 % | 1576 | 153 | FAIL |
| synthetic | 150,000 | 2 | 599,994 | 749,994 | cluster-layout (strategy) | 3 | 4.9 | 0.8 | 3.9 | 6.9 | 100.0 % | 1498 | 153 | n/c¹ |
| synthetic | 150,000 | 2 | 599,994 | 749,994 | cluster-idle (strategy) | 3 | 38.4 | 32.9 | 32.9 | 41.1 | 0.5 % | 1425 | 153 | PASS |
| synthetic | 150,000 | 2 | 599,994 | 749,994 | cluster-interaction (strategy) | 3 | 25.1 | 12.7 | 15.0 | 23.6 | 61.9 % | 1160 | 153 | FAIL |
| synthetic | 150,000 | 3 | 899,988 | 1,049,988 | layout | 3 | 47.0 | 9.1 | 18.3 | 163.9 | 11.3 % | 1214 | 193 | n/c¹ |
| synthetic | 150,000 | 3 | 899,988 | 1,049,988 | idle | 3 | 19.0 | 16.5 | 18.3 | 18.4 | 100.0 % | 1640 | 193 | FAIL |
| synthetic | 150,000 | 3 | 899,988 | 1,049,988 | interaction | 3 | 32.3 | 15.0 | 15.0 | 41.1 | 30.1 % | 1877 | 193 | PASS |
| synthetic | 150,000 | 3 | 899,988 | 1,049,988 | repaint (x1) | 3 | 5.9 | 3.3 | 3.6 | 5.7 | 100.0 % | 1700 | 193 | FAIL |
| synthetic | 150,000 | 3 | 899,988 | 1,049,988 | repaint (x16) | 3 | 5.8 | 3.3 | 3.7 | 5.7 | 100.0 % | 1710 | 193 | FAIL |
| synthetic | 150,000 | 3 | 899,988 | 1,049,988 | cluster-layout (strategy) | 3 | 4.3 | 0.7 | 3.6 | 5.7 | 100.0 % | 1627 | 193 | n/c¹ |
| synthetic | 150,000 | 3 | 899,988 | 1,049,988 | cluster-idle (strategy) | 3 | 38.7 | 27.5 | 32.9 | 41.1 | 1.8 % | 1796 | 193 | PASS |
| synthetic | 150,000 | 3 | 899,988 | 1,049,988 | cluster-interaction (strategy) | 3 | 18.3 | 8.6 | 10.3 | 18.3 | 73.8 % | 1498 | 193 | FAIL |
| synthetic | 150,000 | 5 | 1,499,970 | 1,649,970 | layout | 3 | 50.5 | 13.0 | 161.3 | 163.9 | 1.5 % | 1475 | 273 | n/c¹ |
| synthetic | 150,000 | 5 | 1,499,970 | 1,649,970 | idle | 3 | 12.8 | 12.0 | 12.7 | 12.7 | 100.0 % | 1854 | 273 | FAIL |
| synthetic | 150,000 | 5 | 1,499,970 | 1,649,970 | interaction | 3 | 21.5 | 8.2 | 8.3 | 27.5 | 54.9 % | 2386 | 273 | FAIL |
| synthetic | 150,000 | 5 | 1,499,970 | 1,649,970 | repaint (x1) | 3 | 4.0 | 2.1 | 2.4 | 4.1 | 100.0 % | 2314 | 273 | FAIL |
| synthetic | 150,000 | 5 | 1,499,970 | 1,649,970 | repaint (x16) | 3 | 3.8 | 2.2 | 2.4 | 4.0 | 100.0 % | 2464 | 273 | FAIL |
| synthetic | 150,000 | 5 | 1,499,970 | 1,649,970 | cluster-layout (strategy) | 3 | 3.8 | 2.2 | 2.4 | 3.9 | 100.0 % | 2131 | 273 | n/c¹ |
| synthetic | 150,000 | 5 | 1,499,970 | 1,649,970 | cluster-idle (strategy) | 3 | 42.5 | 27.5 | 33.0 | 41.3 | 1.9 % | 2364 | 273 | PASS |
| synthetic | 150,000 | 5 | 1,499,970 | 1,649,970 | cluster-interaction (strategy) | 3 | 13.3 | 5.5 | 7.4 | 13.8 | 91.9 % | 1407 | 273 | FAIL |

¹ Schema v1: the `layout` / `cluster-layout` window started at the canvas' layout commit, before Cosmograph had uploaded the data, so it mixes fast empty frames with the upload stall. Not comparable and not judged; schema v2 starts these windows at the first frame drawn with the data and reports the upload separately.

### Frame rate vs rendered links (baseline canvas)

Rendering cost follows the links drawn more than the agents. Rows are ordered by links. The line is a least-squares fit of mean frame time on links over the points not capped by the display refresh; it estimates where mean FPS crosses 30 (33.3 ms per frame).

#### idle

| Links | Agents | Density | Entities | Mean FPS | Mean frame (ms) | 1% low | > 30 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 39,994 | 10,000 | 2 | 49,994 | 165.0 | 6.1 | 161.3 | PASS |
| 59,988 | 10,000 | 3 | 69,988 | 164.5 | 6.1 | 161.3 | PASS |
| 99,970 | 10,000 | 5 | 109,970 | 144.0 | 6.9 | 82.0 | PASS |
| 99,994 | 25,000 | 2 | 124,994 | 135.7 | 7.4 | 82.0 | PASS |
| 149,988 | 25,000 | 3 | 174,988 | 92.8 | 10.8 | 81.3 | PASS |
| 199,994 | 50,000 | 2 | 249,994 | 70.4 | 14.2 | 54.6 | PASS |
| 249,970 | 25,000 | 5 | 274,970 | 65.3 | 15.3 | 54.6 | PASS |
| 299,988 | 50,000 | 3 | 349,988 | 51.7 | 19.3 | 41.1 | PASS |
| 399,994 | 100,000 | 2 | 499,994 | 38.5 | 26.0 | 32.9 | PASS |
| 499,970 | 50,000 | 5 | 549,970 | 34.3 | 29.1 | 32.9 | PASS |
| 599,988 | 100,000 | 3 | 699,988 | 28.0 | 35.7 | 23.6 | FAIL |
| 599,994 | 150,000 | 2 | 749,994 | 26.0 | 38.5 | 23.5 | FAIL |
| 899,988 | 150,000 | 3 | 1,049,988 | 19.0 | 52.6 | 16.5 | FAIL |
| 999,970 | 100,000 | 5 | 1,099,970 | 18.6 | 53.8 | 16.5 | FAIL |
| 1,499,970 | 150,000 | 5 | 1,649,970 | 12.8 | 77.9 | 12.0 | FAIL |

Fit over 13 point(s): frame ≈ 3.82 ms + 5.12 ms per 100k links (R² = 0.992); crosses 30 FPS at ≈ 576,413 links.
Two-factor fit: frame ≈ 2.36 ms + 6.19 ms per 100k agents + 4.48 ms per 100k links (R² = 0.999).
Highest link count that passes: 499,970; lowest that fails: 599,988.

#### interaction

| Links | Agents | Density | Entities | Mean FPS | Mean frame (ms) | 1% low | > 30 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 39,994 | 10,000 | 2 | 49,994 | 164.9 | 6.1 | 161.3 | PASS |
| 59,988 | 10,000 | 3 | 69,988 | 165.0 | 6.1 | 161.3 | PASS |
| 99,970 | 10,000 | 5 | 109,970 | 153.7 | 6.5 | 82.0 | PASS |
| 99,994 | 25,000 | 2 | 124,994 | 165.0 | 6.1 | 161.3 | PASS |
| 149,988 | 25,000 | 3 | 174,988 | 153.1 | 6.5 | 82.0 | PASS |
| 199,994 | 50,000 | 2 | 249,994 | 126.8 | 7.9 | 55.0 | PASS |
| 249,970 | 25,000 | 5 | 274,970 | 72.3 | 13.8 | 41.0 | PASS |
| 299,988 | 50,000 | 3 | 349,988 | 106.5 | 9.4 | 41.1 | PASS |
| 399,994 | 100,000 | 2 | 499,994 | 66.7 | 15.0 | 33.0 | PASS |
| 499,970 | 50,000 | 5 | 549,970 | 36.4 | 27.4 | 23.5 | PASS |
| 599,988 | 100,000 | 3 | 699,988 | 40.3 | 24.8 | 20.6 | PASS |
| 599,994 | 150,000 | 2 | 749,994 | 48.2 | 20.7 | 23.5 | PASS |
| 899,988 | 150,000 | 3 | 1,049,988 | 32.3 | 30.9 | 15.0 | PASS |
| 999,970 | 100,000 | 5 | 1,099,970 | 22.2 | 45.0 | 11.8 | FAIL |
| 1,499,970 | 150,000 | 5 | 1,649,970 | 21.5 | 46.6 | 8.2 | FAIL |

Fit over 10 point(s): frame ≈ 4.43 ms + 3.16 ms per 100k links (R² = 0.877); crosses 30 FPS at ≈ 915,457 links.
Two-factor fit: frame ≈ 6.96 ms + -6.63 ms per 100k agents + 3.73 ms per 100k links (R² = 0.900).
Highest link count that passes: 899,988; lowest that fails: 999,970.

#### repaint (x1)

| Links | Agents | Density | Entities | Mean FPS | Mean frame (ms) | 1% low | > 30 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 39,994 | 10,000 | 2 | 49,994 | 164.5 | 6.1 | 161.3 | PASS |
| 59,988 | 10,000 | 3 | 69,988 | 165.0 | 6.1 | 161.3 | PASS |
| 99,970 | 10,000 | 5 | 109,970 | 165.0 | 6.1 | 161.3 | PASS |
| 99,994 | 25,000 | 2 | 124,994 | 156.4 | 6.4 | 55.3 | PASS |
| 149,988 | 25,000 | 3 | 174,988 | 151.5 | 6.6 | 55.0 | PASS |
| 199,994 | 50,000 | 2 | 249,994 | 125.8 | 7.9 | 27.5 | PASS |
| 249,970 | 25,000 | 5 | 274,970 | 113.9 | 8.8 | 41.1 | PASS |
| 299,988 | 50,000 | 3 | 349,988 | 103.2 | 9.7 | 23.5 | PASS |
| 399,994 | 100,000 | 2 | 499,994 | 14.6 | 68.5 | 5.6 | FAIL |
| 499,970 | 50,000 | 5 | 549,970 | 26.6 | 37.6 | 8.4 | FAIL |
| 599,988 | 100,000 | 3 | 699,988 | 10.5 | 95.2 | 5.0 | FAIL |
| 599,994 | 150,000 | 2 | 749,994 | 7.6 | 130.9 | 4.3 | FAIL |
| 899,988 | 150,000 | 3 | 1,049,988 | 5.9 | 169.8 | 3.3 | FAIL |
| 999,970 | 100,000 | 5 | 1,099,970 | 6.9 | 145.8 | 3.6 | FAIL |
| 1,499,970 | 150,000 | 5 | 1,649,970 | 4.0 | 248.8 | 2.1 | FAIL |

Fit over 10 point(s): frame ≈ -27.70 ms + 19.20 ms per 100k links (R² = 0.917); crosses 30 FPS at ≈ 317,890 links.
Two-factor fit: frame ≈ -54.98 ms + 71.30 ms per 100k agents + 13.01 ms per 100k links (R² = 0.994).
Highest link count that passes: 299,988; lowest that fails: 399,994.

### Load timings (median ms)

| Source | Agents | Density | Scenarios | Generate | Fetch | Network | Parse | topologyToData | prepareCosmographData | Mount | Upload (first frame)² | Layout until freeze | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| synthetic | 10,000 | 2 | 3 | 21 | – | – | 6 | 4 | 622 | 5 | – | 5,005 | 5,723 |
| synthetic | 10,000 | 3 | 3 | 21 | – | – | 11 | 5 | 672 | 5 | – | 5,007 | 5,768 |
| synthetic | 10,000 | 5 | 3 | 28 | – | – | 12 | 7 | 676 | 5 | – | 5,020 | 5,798 |
| synthetic | 25,000 | 2 | 3 | 29 | – | – | 14 | 9 | 739 | 7 | – | 5,026 | 5,935 |
| synthetic | 25,000 | 3 | 3 | 37 | – | – | 20 | 11 | 800 | 5 | – | 5,026 | 6,033 |
| synthetic | 25,000 | 5 | 3 | 57 | – | – | 31 | 18 | 975 | 5 | – | 5,018 | 6,253 |
| synthetic | 50,000 | 2 | 3 | 50 | – | – | 30 | 17 | 1,038 | 5 | – | 5,029 | 6,375 |
| synthetic | 50,000 | 3 | 3 | 71 | – | – | 40 | 23 | 1,128 | 4 | – | 5,044 | 6,521 |
| synthetic | 50,000 | 5 | 3 | 103 | – | – | 65 | 36 | 1,400 | 6 | – | 5,023 | 6,914 |
| synthetic | 100,000 | 2 | 3 | 98 | – | – | 90 | 31 | 1,584 | 6 | – | 5,061 | 7,251 |
| synthetic | 100,000 | 3 | 3 | 144 | – | – | 87 | 47 | 1,914 | 6 | – | 5,100 | 7,743 |
| synthetic | 100,000 | 5 | 3 | 220 | – | – | 174 | 69 | 2,412 | 5 | – | 5,124 | 8,510 |
| synthetic | 150,000 | 2 | 3 | 142 | – | – | 115 | 49 | 2,182 | 5 | – | 5,088 | 8,199 |
| synthetic | 150,000 | 3 | 3 | 211 | – | – | 172 | 75 | 2,605 | 6 | – | 5,130 | 8,881 |
| synthetic | 150,000 | 5 | 3 | 344 | – | – | 288 | 132 | 3,494 | 6 | – | 5,810 | 10,999 |

² Layout commit → first frame Cosmograph draws with the data (schema v2; part of *Layout until freeze*).
