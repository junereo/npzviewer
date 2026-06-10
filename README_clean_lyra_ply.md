# Lyra/3DGS PLY Outlier Cleaner

Lyra 2.0 / 3D Gaussian Splatting PLY 파일에서 outlier Gaussian을 제거하는 Python CLI입니다.
`vertex` row를 필터링하므로 `x, y, z`뿐 아니라 `opacity`, `scale_*`, `rot_*`, `f_dc_*`, `f_rest_*` 같은 모든 vertex attribute가 같은 mask로 함께 보존/제거됩니다.

## 실행

```powershell
python clean_lyra_ply.py input.ply cleaned_light.ply --preset light
python clean_lyra_ply.py input.ply cleaned_medium.ply --preset medium
python clean_lyra_ply.py input.ply cleaned_strong.ply --preset strong
```

이 환경처럼 `python`이 PATH에 없으면 Codex 번들 Python을 사용할 수 있습니다.

```powershell
& 'C:\Users\korea\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' clean_lyra_ply.py input.ply cleaned_light.ply --preset light
```

## 주요 옵션

```powershell
python clean_lyra_ply.py input.ply cleaned.ply `
  --opacity-threshold 0.01 `
  --scale-quantile 0.995 `
  --eps-ratio 0.004 `
  --min-samples 8 `
  --min-cluster-ratio 0.0005
```

- `--preset light`: 보수적 시작값입니다.
- `--preset medium`: 일반적인 제거 강도입니다.
- `--preset strong`: 더 많이 지웁니다. 작은 구조물이 손실될 수 있습니다.
- `--eps`: bbox 비율 대신 DBSCAN 절대 거리값을 직접 지정합니다.
- `--no-sor`: Statistical Outlier Removal 단계를 끕니다.

처음에는 `light`, `medium`, `strong` 결과를 각각 만든 뒤 Unreal/SIBR viewer에서 비교하는 것을 권장합니다.
