#version 300 es
precision highp float;

// 유니폼 변수
uniform vec2 u_resolution;
uniform sampler2D u_velocityTexture;

// 출력
out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;

    // 속도장 샘플링
    vec2 vel = texture(u_velocityTexture, uv).rg;

    // 흰 배경
    vec3 color = vec3(1.0);

    // 마우스로 그린 잉크색 (속도 정규화로 검게 변하는 현상 방지)
    float speed = length(vel);
    float speedNorm = clamp(speed / 2.0, 0.0, 1.0); // 속도를 0~1 범위로 정규화
    vec3 inkColor = vec3(0.0);
    color = mix(color, inkColor, speedNorm);

    fragColor = vec4(color, 1.0);
}
