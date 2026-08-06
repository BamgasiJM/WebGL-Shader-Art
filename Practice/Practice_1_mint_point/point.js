/**
 * ============================================================================
 * [WebGL2 Modern Point Rendering]
 * - WebGL 1.0 (attribute, gl_FragColor) -> WebGL 2.0 (in, out, layout)
 * - VAO(Vertex Array Object) 적용
 * ============================================================================
 */

// window.onload : 모든 리소스(이미지, CSS 등) 로드 완료 후 실행. 가장 늦지만 가장 안전함.
window.onload = function () {
  // 1. 컨텍스트 생성 (WebGL2 명시)
  const canvas = document.getElementById("webgl_canvas");
  const gl = canvas.getContext("webgl2");

  if (!gl) {
    alert("WebGL2를 지원하지 않는 환경입니다.");
    return;
  }

  // --- [2. 셰이더 소스 코드 정의 (GLSL 3.00 es)] ---

  // Vertex Shader: 점의 위치와 크기를 결정
  const vsSource = `#version 300 es
        layout(location = 0) in vec2 a_position; // attribute 대신 in 사용
        void main(void) {
            gl_Position = vec4(a_position, 0.0, 1.0);
            gl_PointSize = 200.0; // 점의 크기 설정
        }`;

  // Fragment Shader: 점의 색상을 결정
  const fsSource = `#version 300 es
        precision highp float;
        out vec4 outColor; // gl_FragColor 대신 사용자 정의 출력 변수 사용
        void main(void) {
            outColor = vec4(0.1, 0.7, 0.7, 1.0);
        }`;

  // --- [3. 셰이더 컴파일 및 프로그램 생성 함수] ---

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader Error:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program Link Error:", gl.getProgramInfoLog(program));
  }
  gl.useProgram(program);

  // --- [4. 버퍼 및 VAO(Vertex Array Object) 설정] ---

  // 데이터 준비: 중심점 (0.0, 0.0)
  const vertices = new Float32Array([0.0, 0.0]);

  // VAO 생성 및 바인딩 (WebGL2의 핵심: 상태 저장)
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  // VBO 생성 및 데이터 할당
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  // Vertex Attribute 설정 (layout(location=0)과 매칭)
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // --- [5. 렌더링 실행] ---

  // 배경색 설정 (검은색)
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // VAO 바인딩 후 그리기 명령 수행
  gl.bindVertexArray(vao);
  // gl.POINTS 모드로 정점 개수(1개)만큼 그리기
  gl.drawArrays(gl.POINTS, 0, 1);
};
