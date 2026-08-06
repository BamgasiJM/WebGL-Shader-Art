// ========================================
// 캔버스 엘리먼트 참조
// ========================================
const canvas = document.getElementById("webgl_canvas");

// ========================================
// WebGL2 컨텍스트 생성
// ========================================
// alpha: false
//   기본값(true)일 경우 캔버스 뒤 배경(body 등)과 프래그먼트 셰이더의 알파값이
//   합성(compositing)되어, 셰이더에서 의도하지 않은 반투명 결과가 나올 수 있음.
//   false로 지정하면 컨텍스트가 항상 불투명한 프레임버퍼로 동작함.
// antialias: false
//   MSAA(멀티샘플 안티앨리어싱)를 끄는 옵션. 이 코드는 화면 전체를 덮는
//   사각형 하나만 그리고 실제 형태는 프래그먼트 셰이더 내부 연산으로 결정되므로,
//   래스터라이저 단계의 MSAA는 비용 대비 효과가 없어 비활성화함.
// preserveDrawingBuffer: false
//   각 프레임을 그리기 전 이전 프레임의 내용을 버퍼에 남겨둘지 여부.
//   실시간 렌더링에서는 매 프레임 새로 그리므로 false로 두어 브라우저가
//   버퍼를 재사용하도록 하는 편이 성능에 유리함.
const gl = canvas.getContext("webgl2", {
  alpha: false,
  antialias: false,
  preserveDrawingBuffer: false,
});

if (!gl) {
  alert("WebGL2를 지원하지 않는 브라우저입니다.");
  throw new Error("WebGL2 not supported");
}

// ========================================
// 캔버스 해상도 계산 및 뷰포트 동기화
// ========================================
// CSS 픽셀(canvas.clientWidth/Height, 화면에 실제로 표시되는 크기)과
// 캔버스 드로잉 버퍼 픽셀(canvas.width/height, 셰이더가 실제로 그려지는 해상도)은
// 서로 다른 개념임. devicePixelRatio를 곱하지 않으면 고밀도 디스플레이(레티나 등)에서
// 드로잉 버퍼 해상도가 물리 픽셀보다 낮아져 결과물이 흐릿하게 보임.
// 상한선을 2로 둔 이유는 3배율 이상 디스플레이에서 드로잉 버퍼 픽셀 수가
// 과도하게 늘어나 프래그먼트 셰이더 연산량이 커지는 것을 막기 위함(성능 대비 체감 이득이 적음).
const dpr = Math.min(window.devicePixelRatio || 1, 2);

function resizeCanvas() {
  const bufferWidth = Math.floor(canvas.clientWidth * dpr);
  const bufferHeight = Math.floor(canvas.clientHeight * dpr);

  // 크기가 실제로 바뀐 경우에만 드로잉 버퍼와 뷰포트를 갱신.
  // 매 프레임 호출해도 안전하지만, 불필요한 GPU 리소스 재할당을 피하기 위한 가드.
  if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
    canvas.width = bufferWidth;
    canvas.height = bufferHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
}

// ========================================
// 포인터 좌표 상태
// ========================================
// u_mouse 유니폼으로 셰이더에 전달할 좌표. 셰이더 쪽 좌표계(왼쪽 아래가 원점)에
// 맞추기 위해 Y축을 반전해서 저장함.
let mouseX = 0;
let mouseY = 0;

// 브라우저 이벤트 좌표(clientX/Y, CSS 픽셀 기준)를 드로잉 버퍼 좌표(물리 픽셀 기준)로
// 변환하는 함수. getBoundingClientRect()는 캔버스가 CSS로 리사이즈된 실제 표시 크기를
// 반환하므로, 이를 drawing buffer 크기와 비교해 스케일 비율을 구함.
function updatePointer(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  mouseX = (clientX - rect.left) * scaleX;
  mouseY = canvas.height - (clientY - rect.top) * scaleY;
}

// ========================================
// 마우스 입력 이벤트 등록
// ========================================
canvas.addEventListener("mousemove", (e) => {
  updatePointer(e.clientX, e.clientY);
});

// ========================================
// 터치 입력 이벤트 등록
// ========================================
// 모바일 환경에서 마우스 이벤트가 발생하지 않으므로 touchmove를 별도로 처리.
// preventDefault로 터치 이동 시 페이지 스크롤이 함께 발생하는 것을 막음.
canvas.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length > 0) {
      updatePointer(e.touches[0].clientX, e.touches[0].clientY);
      e.preventDefault();
    }
  },
  { passive: false } // preventDefault를 호출하려면 passive를 명시적으로 false로 지정해야 함
);

// ========================================
// 셰이더 소스 파일 로드
// ========================================
// 지정한 URL에서 셰이더 소스 코드를 텍스트로 가져옴.
// response.ok를 확인하지 않으면, 경로가 잘못되었을 때 404 응답 본문(HTML)이
// 그대로 셰이더 소스로 취급되어 컴파일 단계에서 원인을 알기 어려운 에러가 발생함.
async function loadShader(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`셰이더 파일 로드 실패 (${response.status}): ${url}`);
  }
  return await response.text();
}

// ========================================
// 셰이더 컴파일
// ========================================
// GLSL 소스 문자열을 받아 GPU 드라이버에 전달하고 컴파일한 뒤,
// WebGLShader 객체를 반환함. 컴파일 실패 시 정보 로그를 포함해
// 즉시 예외를 던져 상위 호출부(init)에서 실행을 중단시킴.
function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    const typeName = type === gl.VERTEX_SHADER ? "Vertex" : "Fragment";
    throw new Error(`${typeName} 셰이더 컴파일 에러:\n${log}`);
  }
  return shader;
}

// ========================================
// 셰이더 프로그램 생성 및 링크
// ========================================
// 컴파일된 정점/프래그먼트 셰이더 두 개를 하나의 WebGLProgram으로 연결(link)함.
// 링크는 두 셰이더 간 varying 변수 등 인터페이스가 일치하는지 검증하는 단계이며,
// 컴파일이 각각 성공해도 링크에서 실패할 수 있음.
function createProgram(vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`프로그램 링크 에러:\n${log}`);
  }

  // 링크가 끝나면 링크된 결과(바이너리)는 program 객체 내부에 보관되고,
  // 개별 셰이더 객체는 더 이상 필요하지 않음. detach 후 delete로
  // GPU 메모리를 즉시 반환하도록 함.
  gl.detachShader(program, vertexShader);
  gl.detachShader(program, fragmentShader);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  return program;
}

// ========================================
// 렌더 루프 상태 변수
// ========================================
let rafId = null; // requestAnimationFrame의 예약 ID. cancelAnimationFrame에 필요.
let isRunning = true; // 현재 탭이 화면에 보이는 상태인지 여부.

// render 함수는 init() 내부의 비동기 초기화가 끝난 뒤 실제 구현으로 재할당됨.
// visibilitychange 리스너가 init() 완료 이전에 먼저 등록되므로,
// 참조 시점에 함수가 존재하도록 빈 함수로 우선 선언해둠.
let render = () => {};

// ========================================
// 탭 가시성 변경에 따른 렌더 루프 제어
// ========================================
// 브라우저 탭이 백그라운드로 전환되면 requestAnimationFrame 콜백 자체가
// 브라우저에 의해 지연되긴 하지만, 명시적으로 루프를 취소해두면
// GPU/CPU 자원을 즉시 반환할 수 있고 탭 복귀 시 재개 시점도 명확해짐.
document.addEventListener("visibilitychange", () => {
  isRunning = document.visibilityState === "visible";
  if (isRunning) {
    rafId = requestAnimationFrame(render);
  } else if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
});

// ========================================
// 초기화 및 렌더 루프 시작
// ========================================
async function init() {
  const vertexSource = await loadShader("shaders/vert.glsl");
  const fragmentSource = await loadShader("shaders/frag.glsl");

  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
  const program = createProgram(vertexShader, fragmentShader);

  // ----------------------------------------
  // VAO(Vertex Array Object) 생성 및 바인딩
  // ----------------------------------------
  // VAO는 이후에 설정하는 버퍼 바인딩, vertexAttribPointer 호출 결과를
  // 하나의 상태 묶음으로 기록하는 컨테이너 객체임. 반드시 버퍼 설정보다
  // 먼저 바인딩해야, 뒤이은 attribute 관련 호출들이 이 VAO에 귀속됨.
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  // ----------------------------------------
  // 정점 버퍼 생성 (풀스크린 쿼드)
  // ----------------------------------------
  // -1~1 범위의 클립 공간 좌표 4개로 화면 전체를 덮는 삼각형 스트립을 구성.
  // 별도의 지오메트리 없이 프래그먼트 셰이더만으로 이미지를 생성하는
  // 셰이더 아트의 전형적인 구조.
  const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const positionBuffer = gl.createBuffer();

  // VAO가 바인딩된 상태에서 ARRAY_BUFFER를 바인딩하고 데이터를 업로드.
  // 이 순서가 바뀌면(즉 VAO 바인딩 전에 버퍼를 설정하면) attribute 상태가
  // 해당 VAO에 기록되지 않음.
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  // ----------------------------------------
  // 정점 attribute 연결
  // ----------------------------------------
  // getAttribLocation은 셰이더에 해당 이름의 attribute가 존재하지 않거나
  // GLSL 컴파일러가 사용되지 않는 변수로 판단해 제거한 경우 -1을 반환함.
  // 이 시점에 검증하지 않으면 vertexAttribPointer가 잘못된 인덱스에
  // 조용히 적용되어, 화면에 아무것도 그려지지 않는 원인을 찾기 어려워짐.
  const a_position = gl.getAttribLocation(program, "a_position");
  if (a_position === -1) {
    throw new Error("a_position 속성을 셰이더에서 찾을 수 없습니다.");
  }
  gl.enableVertexAttribArray(a_position);
  gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);

  // ----------------------------------------
  // 유니폼 위치 조회
  // ----------------------------------------
  // 유니폼은 프레임마다 값이 갱신되지만, 위치(location) 자체는 프로그램이
  // 존재하는 동안 변하지 않으므로 렌더 루프 밖에서 한 번만 조회하면 됨.
  const u_resolution = gl.getUniformLocation(program, "u_resolution");
  const u_time = gl.getUniformLocation(program, "u_time");
  const u_mouse = gl.getUniformLocation(program, "u_mouse");

  // ----------------------------------------
  // 프로그램 활성화
  // ----------------------------------------
  // 이 애플리케이션은 프로그램을 하나만 사용하므로, useProgram은
  // 초기화 단계에서 한 번만 호출하면 충분함. 여러 프로그램을 번갈아 쓰는
  // 경우가 아니라면 렌더 루프 안에서 매 프레임 다시 호출할 필요가 없음.
  gl.useProgram(program);

  // 최초 1회 캔버스 크기를 드로잉 버퍼에 반영하고, 이후 창 크기 변경 시마다 재계산.
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // ----------------------------------------
  // 렌더 루프 함수 정의
  // ----------------------------------------
  const startTime = Date.now();

  render = function () {
    const time = (Date.now() - startTime) * 0.001; // 밀리초 → 초 단위 변환

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform2f(u_resolution, canvas.width, canvas.height);
    gl.uniform1f(u_time, time);
    gl.uniform2f(u_mouse, mouseX, mouseY);

    // VAO를 다시 바인딩해 초기화 단계에서 기록된 attribute 상태를 복원.
    // 여러 VAO를 오가는 구조가 아니라면 생략해도 무방하지만,
    // 다른 코드가 중간에 bindVertexArray를 호출할 가능성을 대비해 명시적으로 유지.
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 탭이 백그라운드 상태면 다음 프레임을 예약하지 않음.
    // 재개는 visibilitychange 리스너가 담당.
    if (isRunning) {
      rafId = requestAnimationFrame(render);
    }
  };

  rafId = requestAnimationFrame(render);
}

// init()은 비동기 함수이므로, 내부에서 던진 예외는 여기서 catch해야
// 처리되지 않은 Promise 거부(unhandled rejection)로 남지 않음.
init().catch((err) => {
  console.error(err);
  alert(`초기화 실패: ${err.message}`);
});