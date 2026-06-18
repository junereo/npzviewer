# Lyra Trajectory Path Planner 구현계획

## 1. 타입 추가

`trajectory-gui/src/features/trajectory/types.ts`에 경로 생성용 타입을 추가한다.

- `PathPlannerDraft`
- `PathPlannerMode`
- `PathPoint`

주요 필드는 다음과 같다.

```ts
type PathPlannerDraft = {
  fps: number;
  durationSec: number;
  frameCount: number;
  start: [number, number, number];
  end: [number, number, number];
  yawDeg: number;
  pitchDeg: number;
  povMode: "follow-path" | "manual";
  easing: "linear" | "smoothstep";
  expectedMeters: number;
  observedMeters: number;
};
```

## 2. 수학 로직 추가

`math.mjs`에 다음 함수를 추가한다.

- `pathLengthMeters(start, end)`
- `normalizePathDistance(draft, targetMeters)`
- `generatePathFrames(draft, intrinsics, imageWidth, imageHeight)`
- `w2cFromCenterForward(center, forward)`

생성 경로는 `1 scene unit = 1m` 규칙을 따른다. 별도 단위 환산은 하지 않는다.

## 3. Store 액션 추가

`store.ts`에 다음 상태와 액션을 추가한다.

- `pathPlanner`
- `setPathPlanner`
- `resetPathPlanner`
- `normalizePathPlannerDistance`
- `applyPathPlanner`

`applyPathPlanner`는 현재 문서가 있으면 첫 frame intrinsics를 재사용한다. 문서가 없으면 기본 `1280 x 720`, `fx/fy=804`, `cx=640`, `cy=360` 값을 사용해 새 trajectory 문서를 만든다.

## 4. UI 추가

`App.tsx`의 오른쪽 `Edit` 패널에 `새 trajectory 만들기` 섹션을 추가한다. 이 섹션은 NPZ 파일 로드 여부와 무관하게 항상 보여야 한다.

구성:

- `새 80프레임 경로`
- 시작점/끝점 숫자 입력
- Y 높이 입력
- `3.0m로 맞추기`
- POV 모드 선택
- yaw/pitch 입력
- `경로를 trajectory에 적용`
- `--pose_scale` 계산 도움말

모든 문구는 한글로 작성한다.

## 5. 중앙 캔버스 편집 추가

`TrajectoryCanvas`에 `PathPlannerScene`을 추가한다.

- X-Z 좌표 평면을 중앙 캔버스에 투영한다.
- 시작점과 끝점을 3D 캔버스에서 직접 드래그한다.
- 오른쪽 패널의 숫자 입력과 캔버스 드래그 상태를 같은 store 값으로 동기화한다.

## 6. 스타일 추가

`styles.css`에 path planner 전용 class를 추가한다.

- `.path-planner`
- `.path-plane`
- `.path-plane-point`
- `.path-readout`
- `.pose-scale-helper`

## 7. 테스트 추가

`trajectory-math.test.mjs`에 다음 테스트를 추가한다.

- 기본 80프레임 생성
- 기본 끝점 `[0, 0, 3]`
- `+Y`가 아래 방향 값으로 유지되는지
- yaw/pitch 수동 POV가 forward vector로 반영되는지
- `w2c`에서 center를 다시 계산했을 때 입력 center와 일치하는지

## 8. 검증

- `pnpm install --frozen-lockfile`
- `node --test`
- `tsc -b`
- `vite build`
- 개발 서버 재실행 후 `http://127.0.0.1:5173/` 확인
