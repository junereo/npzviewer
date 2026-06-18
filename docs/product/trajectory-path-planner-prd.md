# Lyra Trajectory Path Planner PRD

## 목적

Lyra Trajectory GUI에서 사용자가 5초, 16FPS 기준의 80프레임 카메라 이동 경로를 직접 생성하고 수정할 수 있게 한다. 생성된 경로는 Lyra 2.0 trajectory 형식인 `w2c`, `intrinsics`, `image_width`, `image_height` 구조로 내보낼 수 있어야 한다.

## 핵심 전제

- GUI에서 생성하는 경로는 `1.0 scene unit = 1.0 meter`로 고정한다.
- 좌표계는 왼손 좌표계 기준으로 다룬다.
- `+Z`는 앞으로 이동, `-Z`는 뒤로 이동이다.
- `+X`는 오른쪽 이동, `-X`는 왼쪽 이동이다.
- `+Y`는 아래로 이동, `-Y`는 위로 이동이다.
- 기본 생성 경로는 80프레임, 5초, 16FPS, 3.0m 전진이다.
- NPZ 파일이 로드되지 않아도 새 trajectory를 만들 수 있어야 한다.
- Lyra는 입력 trajectory를 첫 프레임 monocular depth 기준의 상대 좌표로 해석하므로 실제 결과 이동량은 예상과 다를 수 있다.
- 실제 결과가 너무 작거나 크면 Lyra 실행 시 `--pose_scale`로 보정한다.

## 사용자 시나리오

1. 사용자가 trajectory 파일을 연다.
2. 오른쪽 `Edit` 패널에서 `경로 생성` 섹션을 확인한다.
3. `새 80프레임 경로`를 눌러 기본 3.0m 전진 경로를 준비한다.
4. 중앙 3D 캔버스의 X-Z 좌표 평면에서 시작점과 끝점을 직접 드래그한다.
5. Y 값을 조정해 위/아래 높이를 설정한다.
6. 카메라 시점 방향을 `경로 진행 방향` 또는 수동 yaw/pitch로 지정한다.
7. `경로를 trajectory에 적용`을 눌러 현재 문서를 80프레임 경로로 교체한다.
8. 기존 export 기능으로 Lyra 호환 `.npz`를 저장한다.

## 범위

### 포함

- 80프레임 경로 생성
- 1 scene unit = 1m 단위 고정
- NPZ 없이 새 trajectory 생성
- 중앙 캔버스 X-Z 평면 시작점/끝점 편집
- Y축 높이 편집
- yaw/pitch 기반 카메라 POV 방향 지정
- 경로 진행 방향 자동 시점
- `--pose_scale` 계산 도움말
- 한글 UI 문구

### 제외

- Lyra 실행 자동화
- 실제 생성 결과의 자동 거리 측정
- 프롬프트별 영상 생성 호출
- 다중 구간 timeline editor 전체 구현

## 기능 요구사항

### 경로 기본값

- FPS: 16
- Duration: 5초
- Frame count: 80
- Start: `[0, 0, 0]`
- End: `[0, 0, 3]`
- Distance: 3.0m
- Easing: linear
- POV: 경로 진행 방향

### 단위 표시

모든 경로 좌표와 거리 표시는 meter로 노출한다.

```text
Z 앞으로 / -Z 뒤로
+X 오른쪽 / -X 왼쪽
+Y 아래 / -Y 위
```

### pose_scale helper

사용자가 GUI 예상 이동거리와 Lyra 결과에서 체감한 이동거리를 입력하면 추천값을 계산한다.

```text
추천 --pose_scale = GUI 예상 이동거리 / Lyra 결과 이동거리
```

## 성공 기준

- `새 80프레임 경로` 생성 시 문서가 80프레임으로 바뀐다.
- 기본 경로의 시작점은 `[0, 0, 0]`, 끝점은 `[0, 0, 3]`이다.
- 생성된 frame의 `w2c`는 유효한 4x4 matrix이고 마지막 row는 `[0, 0, 0, 1]`이다.
- `intrinsics`는 기존 파일의 첫 frame 값을 유지한다.
- TypeScript build와 Vite build가 성공한다.
