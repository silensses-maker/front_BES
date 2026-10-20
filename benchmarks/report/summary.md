# SiLEnSeSS rendering benchmark report

Generated 2026-10-20T08:08:04.206Z from 1 result file(s) by `benchmarks/scripts/aggregate.ts`.
Values are medians over repetitions; FPS percentiles come from frame-time percentiles (p5 FPS = 1000 / p95 frame time).
**Pass** = median FPS strictly greater than 30 (OE3). GPU memory is an **estimate** from buffer sizes, not a measurement.

## ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11) · 24 threads · Windows · Microsoft Edge 155

- GPU: ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11) (Google Inc. (NVIDIA))
- CPU threads: 24 · device memory: 32 GB (browser-capped)
- Browser: Microsoft Edge 155.0.4283.45 · platform: Windows
- Screen: 2560x1440 @ DPR 1.5 · refresh ≈ 165 Hz
- Builds: 2.0.13 (ed59e82fc358, dirty)
- Files: `bench-2026-10-20T02-55-56-mainpc.json`

### Frame rate by size × density × phase

| Source | Agents | Density | Edges | Phase | Reps | Median FPS | p5 FPS | p1 FPS | Frames > 33.3 ms | Frames > 50 ms | Heap max (MB) | GPU est. (MB) | > 30 FPS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| synthetic | 10,000 | 2 | 39,994 | layout | 3 | 163.9 | 161.3 | 161.3 | 0.3 % | 1 | 1369 | 55 | PASS |
| synthetic | 10,000 | 2 | 39,994 | idle | 3 | 163.9 | 163.9 | 161.3 | 0.0 % | 0 | 1518 | 55 | PASS |
| synthetic | 10,000 | 2 | 39,994 | interaction | 3 | 163.9 | 163.9 | 161.3 | 0.0 % | 0 | 1513 | 55 | PASS |
| synthetic | 10,000 | 2 | 39,994 | repaint (x1) | 3 | 163.9 | 161.3 | 161.3 | 0.0 % | 0 | 2124 | 55 | PASS |
| synthetic | 10,000 | 2 | 39,994 | repaint (x16) | 3 | 163.9 | 55.0 | 41.1 | 0.2 % | 0 | 663 | 55 | PASS |
| synthetic | 10,000 | 2 | 39,994 | cluster-layout (strategy) | 3 | 163.9 | 161.3 | 82.6 | 0.1 % | 1 | 622 | 55 | PASS |
| synthetic | 10,000 | 2 | 39,994 | cluster-idle (strategy) | 3 | 163.9 | 161.3 | 161.3 | 0.0 % | 0 | 606 | 55 | PASS |
| synthetic | 10,000 | 2 | 39,994 | cluster-interaction (strategy) | 3 | 163.9 | 163.9 | 161.3 | 0.0 % | 0 | 282 | 55 | PASS |
| synthetic | 10,000 | 3 | 59,988 | layout | 3 | 163.9 | 82.6 | 82.0 | 0.3 % | 2 | 523 | 57 | PASS |
| synthetic | 10,000 | 3 | 59,988 | idle | 3 | 163.9 | 161.3 | 161.3 | 0.0 % | 0 | 581 | 57 | PASS |
| synthetic | 10,000 | 3 | 59,988 | interaction | 3 | 163.9 | 163.9 | 161.3 | 0.0 % | 0 | 118 | 57 | PASS |
| synthetic | 10,000 | 3 | 59,988 | repaint (x1) | 3 | 163.9 | 163.9 | 161.3 | 0.0 % | 0 | 203 | 57 | PASS |
| synthetic | 10,000 | 3 | 59,988 | repaint (x16) | 3 | 163.9 | 54.6 | 41.1 | 0.4 % | 0 | 288 | 57 | PASS |
| synthetic | 10,000 | 3 | 59,988 | cluster-layout (strategy) | 3 | 163.9 | 161.3 | 161.3 | 0.1 % | 1 | 304 | 57 | PASS |
| synthetic | 10,000 | 3 | 59,988 | cluster-idle (strategy) | 3 | 163.9 | 161.3 | 161.3 | 0.0 % | 0 | 282 | 57 | PASS |
| synthetic | 10,000 | 3 | 59,988 | cluster-interaction (strategy) | 3 | 163.9 | 163.9 | 161.3 | 0.0 % | 0 | 169 | 57 | PASS |
| synthetic | 10,000 | 5 | 99,970 | layout | 3 | 163.9 | 82.0 | 55.0 | 0.5 % | 3 | 512 | 63 | PASS |
| synthetic | 10,000 | 5 | 99,970 | idle | 3 | 163.9 | 82.6 | 82.0 | 0.0 % | 0 | 668 | 63 | PASS |
| synthetic | 10,000 | 5 | 99,970 | interaction | 3 | 163.9 | 82.6 | 82.0 | 0.0 % | 0 | 106 | 63 | PASS |
| synthetic | 10,000 | 5 | 99,970 | repaint (x1) | 3 | 163.9 | 163.9 | 161.3 | 0.0 % | 0 | 281 | 63 | PASS |
| synthetic | 10,000 | 5 | 99,970 | repaint (x16) | 3 | 83.3 | 41.1 | 33.0 | 0.7 % | 0 | 346 | 63 | PASS |
| synthetic | 10,000 | 5 | 99,970 | cluster-layout (strategy) | 3 | 163.9 | 161.3 | 82.6 | 0.1 % | 1 | 307 | 63 | PASS |
| synthetic | 10,000 | 5 | 99,970 | cluster-idle (strategy) | 3 | 163.9 | 163.9 | 161.3 | 0.0 % | 0 | 293 | 63 | PASS |
| synthetic | 10,000 | 5 | 99,970 | cluster-interaction (strategy) | 3 | 163.9 | 82.6 | 55.0 | 0.0 % | 0 | 290 | 63 | PASS |
| synthetic | 25,000 | 2 | 99,994 | layout | 3 | 163.9 | 82.0 | 55.0 | 0.4 % | 2 | 574 | 65 | PASS |
| synthetic | 25,000 | 2 | 99,994 | idle | 3 | 163.9 | 82.0 | 82.0 | 0.0 % | 0 | 682 | 65 | PASS |
| synthetic | 25,000 | 2 | 99,994 | interaction | 3 | 163.9 | 161.3 | 161.3 | 0.0 % | 0 | 119 | 65 | PASS |
| synthetic | 25,000 | 2 | 99,994 | repaint (x1) | 3 | 163.9 | 161.3 | 55.3 | 0.0 % | 0 | 292 | 65 | PASS |
| synthetic | 25,000 | 2 | 99,994 | repaint (x16) | 3 | 55.0 | 27.5 | 18.3 | 8.5 % | 12 | 403 | 65 | PASS |
| synthetic | 25,000 | 2 | 99,994 | cluster-layout (strategy) | 3 | 163.9 | 82.0 | 81.3 | 0.2 % | 1 | 378 | 65 | PASS |
| synthetic | 25,000 | 2 | 99,994 | cluster-idle (strategy) | 3 | 163.9 | 83.3 | 82.0 | 0.0 % | 0 | 334 | 65 | PASS |
| synthetic | 25,000 | 2 | 99,994 | cluster-interaction (strategy) | 3 | 163.9 | 82.6 | 55.0 | 0.1 % | 0 | 150 | 65 | PASS |
| synthetic | 25,000 | 3 | 149,988 | layout | 3 | 82.6 | 55.0 | 33.3 | 0.9 % | 2 | 606 | 72 | PASS |
| synthetic | 25,000 | 3 | 149,988 | idle | 3 | 82.6 | 82.0 | 81.3 | 0.0 % | 0 | 746 | 72 | PASS |
| synthetic | 25,000 | 3 | 149,988 | interaction | 3 | 163.9 | 82.6 | 82.0 | 0.1 % | 0 | 156 | 72 | PASS |
| synthetic | 25,000 | 3 | 149,988 | repaint (x1) | 3 | 163.9 | 82.6 | 55.0 | 0.0 % | 0 | 372 | 72 | PASS |
| synthetic | 25,000 | 3 | 149,988 | repaint (x16) | 3 | 55.0 | 20.7 | 16.5 | 12.8 % | 21 | 447 | 72 | PASS |
| synthetic | 25,000 | 3 | 149,988 | cluster-layout (strategy) | 3 | 163.9 | 82.0 | 81.3 | 0.3 % | 1 | 408 | 72 | PASS |
| synthetic | 25,000 | 3 | 149,988 | cluster-idle (strategy) | 3 | 163.9 | 163.9 | 161.3 | 0.0 % | 0 | 234 | 72 | PASS |
| synthetic | 25,000 | 3 | 149,988 | cluster-interaction (strategy) | 3 | 163.9 | 82.0 | 41.3 | 0.2 % | 0 | 188 | 72 | PASS |
| synthetic | 25,000 | 5 | 249,970 | layout | 3 | 82.6 | 54.6 | 24.6 | 2.4 % | 2 | 643 | 85 | PASS |
| synthetic | 25,000 | 5 | 249,970 | idle | 3 | 55.3 | 54.6 | 54.6 | 0.0 % | 0 | 904 | 85 | PASS |
| synthetic | 25,000 | 5 | 249,970 | interaction | 3 | 82.0 | 41.3 | 41.0 | 0.4 % | 1 | 281 | 85 | PASS |
| synthetic | 25,000 | 5 | 249,970 | repaint (x1) | 3 | 163.9 | 55.0 | 41.1 | 0.2 % | 0 | 556 | 85 | PASS |
| synthetic | 25,000 | 5 | 249,970 | repaint (x16) | 3 | 41.1 | 16.5 | 11.8 | 30.5 % | 33 | 535 | 85 | PASS |
| synthetic | 25,000 | 5 | 249,970 | cluster-layout (strategy) | 3 | 163.9 | 82.0 | 54.6 | 0.4 % | 1 | 455 | 85 | PASS |
| synthetic | 25,000 | 5 | 249,970 | cluster-idle (strategy) | 3 | 163.9 | 161.3 | 161.3 | 0.0 % | 0 | 491 | 85 | PASS |
| synthetic | 25,000 | 5 | 249,970 | cluster-interaction (strategy) | 3 | 82.6 | 32.9 | 20.6 | 4.5 % | 6 | 192 | 85 | PASS |
| synthetic | 50,000 | 2 | 199,994 | layout | 3 | 82.6 | 54.6 | 19.1 | 2.4 % | 4 | 679 | 83 | PASS |
| synthetic | 50,000 | 2 | 199,994 | idle | 3 | 82.0 | 55.0 | 54.6 | 0.1 % | 0 | 937 | 83 | PASS |
| synthetic | 50,000 | 2 | 199,994 | interaction | 3 | 163.9 | 82.0 | 55.0 | 0.1 % | 0 | 323 | 83 | PASS |
| synthetic | 50,000 | 2 | 199,994 | repaint (x1) | 3 | 163.9 | 41.1 | 27.5 | 1.1 % | 0 | 557 | 83 | PASS |
| synthetic | 50,000 | 2 | 199,994 | repaint (x16) | 3 | 23.6 | 9.7 | 8.3 | 60.2 % | 68 | 617 | 83 | FAIL |
| synthetic | 50,000 | 2 | 199,994 | cluster-layout (strategy) | 3 | 82.6 | 55.3 | 36.5 | 0.9 % | 2 | 509 | 83 | PASS |
| synthetic | 50,000 | 2 | 199,994 | cluster-idle (strategy) | 3 | 163.9 | 82.0 | 81.3 | 0.0 % | 0 | 577 | 83 | PASS |
| synthetic | 50,000 | 2 | 199,994 | cluster-interaction (strategy) | 3 | 163.9 | 55.0 | 32.9 | 0.6 % | 2 | 257 | 83 | PASS |
| synthetic | 50,000 | 3 | 299,988 | layout | 3 | 55.3 | 41.1 | 17.6 | 2.5 % | 4 | 707 | 96 | PASS |
| synthetic | 50,000 | 3 | 299,988 | idle | 3 | 55.0 | 41.1 | 41.1 | 0.0 % | 0 | 1011 | 96 | PASS |
| synthetic | 50,000 | 3 | 299,988 | interaction | 3 | 163.9 | 41.3 | 41.1 | 0.1 % | 0 | 400 | 96 | PASS |
| synthetic | 50,000 | 3 | 299,988 | repaint (x1) | 3 | 163.9 | 27.6 | 23.5 | 6.3 % | 2 | 616 | 96 | PASS |
| synthetic | 50,000 | 3 | 299,988 | repaint (x16) | 3 | 20.7 | 8.7 | 7.9 | 78.2 % | 65 | 706 | 96 | FAIL |
| synthetic | 50,000 | 3 | 299,988 | cluster-layout (strategy) | 3 | 82.6 | 54.6 | 27.4 | 1.3 % | 2 | 673 | 96 | PASS |
| synthetic | 50,000 | 3 | 299,988 | cluster-idle (strategy) | 3 | 163.9 | 82.0 | 81.3 | 0.0 % | 0 | 670 | 96 | PASS |
| synthetic | 50,000 | 3 | 299,988 | cluster-interaction (strategy) | 3 | 163.9 | 33.1 | 20.6 | 3.7 % | 5 | 279 | 96 | PASS |
| synthetic | 50,000 | 5 | 499,970 | layout | 3 | 163.9 | 32.9 | 18.6 | 3.8 % | 3 | 874 | 123 | PASS |
| synthetic | 50,000 | 5 | 499,970 | idle | 3 | 33.0 | 32.9 | 32.9 | 0.3 % | 0 | 1149 | 123 | PASS |
| synthetic | 50,000 | 5 | 499,970 | interaction | 3 | 33.2 | 23.6 | 23.5 | 20.4 % | 0 | 1272 | 123 | PASS |
| synthetic | 50,000 | 5 | 499,970 | repaint (x1) | 3 | 41.1 | 11.3 | 8.4 | 36.5 % | 81 | 862 | 123 | PASS |
| synthetic | 50,000 | 5 | 499,970 | repaint (x16) | 3 | 16.5 | 6.6 | 5.5 | 69.7 % | 95 | 905 | 123 | FAIL |
| synthetic | 50,000 | 5 | 499,970 | cluster-layout (strategy) | 3 | 82.6 | 41.1 | 39.9 | 0.6 % | 1 | 956 | 123 | PASS |
| synthetic | 50,000 | 5 | 499,970 | cluster-idle (strategy) | 3 | 161.3 | 82.0 | 81.3 | 0.0 % | 0 | 925 | 123 | PASS |
| synthetic | 50,000 | 5 | 499,970 | cluster-interaction (strategy) | 3 | 33.1 | 16.3 | 10.7 | 34.5 % | 29 | 377 | 123 | PASS |
| synthetic | 100,000 | 2 | 399,994 | layout | 3 | 163.9 | 32.9 | 17.4 | 3.6 % | 3 | 985 | 118 | PASS |
| synthetic | 100,000 | 2 | 399,994 | idle | 3 | 41.1 | 32.9 | 32.9 | 0.3 % | 0 | 1250 | 118 | PASS |
| synthetic | 100,000 | 2 | 399,994 | interaction | 3 | 82.0 | 41.1 | 33.0 | 0.0 % | 0 | 480 | 118 | PASS |
| synthetic | 100,000 | 2 | 399,994 | repaint (x1) | 3 | 11.8 | 6.1 | 5.6 | 55.4 % | 78 | 1040 | 118 | FAIL |
| synthetic | 100,000 | 2 | 399,994 | repaint (x16) | 3 | 11.0 | 5.3 | 4.8 | 67.9 % | 72 | 1015 | 118 | FAIL |
| synthetic | 100,000 | 2 | 399,994 | cluster-layout (strategy) | 3 | 55.0 | 34.7 | 9.3 | 3.6 % | 4 | 909 | 118 | PASS |
| synthetic | 100,000 | 2 | 399,994 | cluster-idle (strategy) | 3 | 55.0 | 54.6 | 41.3 | 0.0 % | 0 | 994 | 118 | PASS |
| synthetic | 100,000 | 2 | 399,994 | cluster-interaction (strategy) | 3 | 33.1 | 23.5 | 18.3 | 27.1 % | 5 | 495 | 118 | PASS |
| synthetic | 100,000 | 3 | 599,988 | layout | 3 | 163.9 | 23.6 | 12.8 | 26.9 % | 6 | 825 | 145 | PASS |
| synthetic | 100,000 | 3 | 599,988 | idle | 3 | 27.5 | 27.4 | 23.6 | 89.0 % | 0 | 1351 | 145 | FAIL |
| synthetic | 100,000 | 3 | 599,988 | interaction | 3 | 41.3 | 23.5 | 20.6 | 18.9 % | 1 | 1425 | 145 | PASS |
| synthetic | 100,000 | 3 | 599,988 | repaint (x1) | 3 | 9.2 | 5.2 | 5.0 | 62.9 % | 64 | 1226 | 145 | FAIL |
| synthetic | 100,000 | 3 | 599,988 | repaint (x16) | 3 | 8.7 | 4.7 | 3.8 | 90.1 % | 65 | 1155 | 145 | FAIL |
| synthetic | 100,000 | 3 | 599,988 | cluster-layout (strategy) | 3 | 55.3 | 33.0 | 7.9 | 2.3 % | 4 | 1186 | 145 | PASS |
| synthetic | 100,000 | 3 | 599,988 | cluster-idle (strategy) | 3 | 55.3 | 54.6 | 41.1 | 0.0 % | 0 | 1200 | 145 | PASS |
| synthetic | 100,000 | 3 | 599,988 | cluster-interaction (strategy) | 3 | 27.5 | 16.5 | 12.7 | 60.0 % | 45 | 691 | 145 | FAIL |
| synthetic | 100,000 | 5 | 999,970 | layout | 3 | 163.9 | 18.3 | 10.4 | 10.4 % | 23 | 1082 | 198 | PASS |
| synthetic | 100,000 | 5 | 999,970 | idle | 3 | 18.4 | 18.3 | 16.5 | 100.0 % | 146 | 1291 | 198 | FAIL |
| synthetic | 100,000 | 5 | 999,970 | interaction | 3 | 23.6 | 12.7 | 11.8 | 68.0 % | 84 | 1704 | 198 | FAIL |
| synthetic | 100,000 | 5 | 999,970 | repaint (x1) | 3 | 6.6 | 4.0 | 3.6 | 100.0 % | 64 | 1663 | 198 | FAIL |
| synthetic | 100,000 | 5 | 999,970 | repaint (x16) | 3 | 7.2 | 4.6 | 3.6 | 100.0 % | 68 | 1683 | 198 | FAIL |
| synthetic | 100,000 | 5 | 999,970 | cluster-layout (strategy) | 3 | 7.2 | 4.0 | 1.1 | 100.0 % | 22 | 1636 | 198 | FAIL |
| synthetic | 100,000 | 5 | 999,970 | cluster-idle (strategy) | 3 | 55.0 | 41.1 | 41.1 | 0.2 % | 0 | 1508 | 198 | PASS |
| synthetic | 100,000 | 5 | 999,970 | cluster-interaction (strategy) | 3 | 16.5 | 11.0 | 7.6 | 81.4 % | 109 | 828 | 198 | FAIL |
| synthetic | 150,000 | 2 | 599,994 | layout | 3 | 163.9 | 23.5 | 11.4 | 21.6 % | 6 | 1032 | 153 | PASS |
| synthetic | 150,000 | 2 | 599,994 | idle | 3 | 27.5 | 23.5 | 23.5 | 100.0 % | 1 | 1717 | 153 | FAIL |
| synthetic | 150,000 | 2 | 599,994 | interaction | 3 | 55.0 | 27.5 | 23.5 | 7.8 % | 0 | 668 | 153 | PASS |
| synthetic | 150,000 | 2 | 599,994 | repaint (x1) | 3 | 6.9 | 4.8 | 4.3 | 89.4 % | 60 | 1489 | 153 | FAIL |
| synthetic | 150,000 | 2 | 599,994 | repaint (x16) | 3 | 6.6 | 4.5 | 4.0 | 100.0 % | 74 | 1576 | 153 | FAIL |
| synthetic | 150,000 | 2 | 599,994 | cluster-layout (strategy) | 3 | 6.9 | 3.9 | 0.8 | 100.0 % | 22 | 1498 | 153 | FAIL |
| synthetic | 150,000 | 2 | 599,994 | cluster-idle (strategy) | 3 | 41.1 | 32.9 | 32.9 | 0.5 % | 0 | 1425 | 153 | PASS |
| synthetic | 150,000 | 2 | 599,994 | cluster-interaction (strategy) | 3 | 23.6 | 15.0 | 12.7 | 61.9 % | 55 | 1160 | 153 | FAIL |
| synthetic | 150,000 | 3 | 899,988 | layout | 3 | 163.9 | 18.3 | 9.1 | 11.3 % | 23 | 1214 | 193 | PASS |
| synthetic | 150,000 | 3 | 899,988 | idle | 3 | 18.4 | 18.3 | 16.5 | 100.0 % | 126 | 1640 | 193 | FAIL |
| synthetic | 150,000 | 3 | 899,988 | interaction | 3 | 41.1 | 15.0 | 15.0 | 30.1 % | 34 | 1877 | 193 | PASS |
| synthetic | 150,000 | 3 | 899,988 | repaint (x1) | 3 | 5.7 | 3.6 | 3.3 | 100.0 % | 54 | 1700 | 193 | FAIL |
| synthetic | 150,000 | 3 | 899,988 | repaint (x16) | 3 | 5.7 | 3.7 | 3.3 | 100.0 % | 63 | 1710 | 193 | FAIL |
| synthetic | 150,000 | 3 | 899,988 | cluster-layout (strategy) | 3 | 5.7 | 3.6 | 0.7 | 100.0 % | 23 | 1627 | 193 | FAIL |
| synthetic | 150,000 | 3 | 899,988 | cluster-idle (strategy) | 3 | 41.1 | 32.9 | 27.5 | 1.8 % | 1 | 1796 | 193 | PASS |
| synthetic | 150,000 | 3 | 899,988 | cluster-interaction (strategy) | 3 | 18.3 | 10.3 | 8.6 | 73.8 % | 97 | 1498 | 193 | FAIL |
| synthetic | 150,000 | 5 | 1,499,970 | layout | 3 | 163.9 | 161.3 | 13.0 | 1.5 % | 3 | 1475 | 273 | PASS |
| synthetic | 150,000 | 5 | 1,499,970 | idle | 3 | 12.7 | 12.7 | 12.0 | 100.0 % | 129 | 1854 | 273 | FAIL |
| synthetic | 150,000 | 5 | 1,499,970 | interaction | 3 | 27.5 | 8.3 | 8.2 | 54.9 % | 72 | 2386 | 273 | FAIL |
| synthetic | 150,000 | 5 | 1,499,970 | repaint (x1) | 3 | 4.1 | 2.4 | 2.1 | 100.0 % | 44 | 2314 | 273 | FAIL |
| synthetic | 150,000 | 5 | 1,499,970 | repaint (x16) | 3 | 4.0 | 2.4 | 2.2 | 100.0 % | 41 | 2464 | 273 | FAIL |
| synthetic | 150,000 | 5 | 1,499,970 | cluster-layout (strategy) | 3 | 3.9 | 2.4 | 2.2 | 100.0 % | 16 | 2131 | 273 | FAIL |
| synthetic | 150,000 | 5 | 1,499,970 | cluster-idle (strategy) | 3 | 41.3 | 33.0 | 27.5 | 1.9 % | 0 | 2364 | 273 | PASS |
| synthetic | 150,000 | 5 | 1,499,970 | cluster-interaction (strategy) | 3 | 13.8 | 7.4 | 5.5 | 91.9 % | 87 | 1407 | 273 | FAIL |

### Load timings (median ms)

| Source | Agents | Density | Scenarios | Generate | Fetch | Network | Parse | topologyToData | prepareCosmographData | Mount | Layout until freeze | Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| synthetic | 10,000 | 2 | 3 | 21 | – | – | 6 | 4 | 622 | 5 | 5,005 | 5,723 |
| synthetic | 10,000 | 3 | 3 | 21 | – | – | 11 | 5 | 672 | 5 | 5,007 | 5,768 |
| synthetic | 10,000 | 5 | 3 | 28 | – | – | 12 | 7 | 676 | 5 | 5,020 | 5,798 |
| synthetic | 25,000 | 2 | 3 | 29 | – | – | 14 | 9 | 739 | 7 | 5,026 | 5,935 |
| synthetic | 25,000 | 3 | 3 | 37 | – | – | 20 | 11 | 800 | 5 | 5,026 | 6,033 |
| synthetic | 25,000 | 5 | 3 | 57 | – | – | 31 | 18 | 975 | 5 | 5,018 | 6,253 |
| synthetic | 50,000 | 2 | 3 | 50 | – | – | 30 | 17 | 1,038 | 5 | 5,029 | 6,375 |
| synthetic | 50,000 | 3 | 3 | 71 | – | – | 40 | 23 | 1,128 | 4 | 5,044 | 6,521 |
| synthetic | 50,000 | 5 | 3 | 103 | – | – | 65 | 36 | 1,400 | 6 | 5,023 | 6,914 |
| synthetic | 100,000 | 2 | 3 | 98 | – | – | 90 | 31 | 1,584 | 6 | 5,061 | 7,251 |
| synthetic | 100,000 | 3 | 3 | 144 | – | – | 87 | 47 | 1,914 | 6 | 5,100 | 7,743 |
| synthetic | 100,000 | 5 | 3 | 220 | – | – | 174 | 69 | 2,412 | 5 | 5,124 | 8,510 |
| synthetic | 150,000 | 2 | 3 | 142 | – | – | 115 | 49 | 2,182 | 5 | 5,088 | 8,199 |
| synthetic | 150,000 | 3 | 3 | 211 | – | – | 172 | 75 | 2,605 | 6 | 5,130 | 8,881 |
| synthetic | 150,000 | 5 | 3 | 344 | – | – | 288 | 132 | 3,494 | 6 | 5,810 | 10,999 |
