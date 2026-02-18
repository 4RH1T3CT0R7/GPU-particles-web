/**
 * Shape dispatcher / targetFor function (raw GLSL)
 */
export const shapesDispatcherGLSL: string = `
  vec3 targetFor(int sid, vec2 id, float time, int seedSlot){
    float s = fract(id.x + id.y*1.618 + noise(id*17.0)); // [0,1]
    float angle = (id.x + noise(id*3.1))*6.28318530718;
    vec3 p;

    if (sid==0){ // rotating cube
      vec3 p3 = shape_cube(angle / 6.28318530718, s);
      p = applyRotation(p3, seedSlot);
    } else if (sid==1){ // sphere
      vec3 p3 = shape_sphere(angle / 6.28318530718, s);
      p = applyRotation(p3, seedSlot);
    } else if (sid==2){ // torus
      vec3 p3 = shape_torus(angle / 6.28318530718, s);
      p = applyRotation(p3, seedSlot);
    } else if (sid==3){ // helix
      vec3 p3 = shape_helix(angle / 6.28318530718, s);
      p = applyRotation(p3, seedSlot);
    } else if (sid==4){ // octahedron
      vec3 p3 = shape_octahedron(angle / 6.28318530718, s);
      p = applyRotation(p3, seedSlot);
    } else if (sid==5){ // superformula (2D -> 3D sheet)
      float m = 6.0 + 2.0*sin(time*0.2);
      float n1 = 0.3 + 0.2*sin(time*0.13);
      float n2 = 1.7 + 0.7*sin(time*0.17);
      float n3 = 1.7 + 0.7*cos(time*0.11);
      vec2 p2 = shape_superformula(angle, m, n1, n2, n3)*(0.3 + 0.7*sqrt(s));
      p = applyRotation(vec3(p2, (noise(id*9.0)-0.5)*0.6), seedSlot);
    } else if (sid==6){ // rose
      float k = 5.0 + floor(mod(time*0.15, 3.0));
      vec2 p2 = shape_rose(angle, k)*(0.3 + 0.7*sqrt(s));
      p = applyRotation(vec3(p2, (noise(id*7.3)-0.5)*0.8), seedSlot);
    } else if (sid==7){ // wave
      vec3 p3 = shape_wave(s, angle / 6.28318530718);
      p = applyRotation(p3, seedSlot);
    } else if (sid==8){ // ribbon
      vec3 p3 = shape_ribbon(angle / 6.28318530718, s);
      p = applyRotation(p3, seedSlot);
    } else if (sid==9){ // icosahedron
      vec3 p3 = shape_icosahedron(angle / 6.28318530718, s);
      p = applyRotation(p3, seedSlot);
    } else if (sid==11){ // фрактальный режим
      vec4 seed = u_fractalSeeds[seedSlot];
      vec3 f = fractalFlow(id, time, seed);
      float shells = 0.4 + 0.35 * sin(time * 0.3 + seed.w);
      p = applyRotation(f * (0.9 + shells), seedSlot);
      p.xy += curl(id * 8.5 + seed.xy * 2.7 + time * 0.2) * 0.15;
      p.z += sin(angle * 0.6 + seed.z + time * 0.2) * 0.18;
    } else if (sid==12){ // эквалайзер - плоскость с волнами от аудио
      p = shape_equalizer(id.x, id.y, u_audioBass, u_audioMid, u_audioTreble, time);
    } else { // polygon/star
      float n = 5.0 + floor(mod(time*0.2, 4.0));
      vec2 p2 = shape_polygon(angle, n)*(0.5 + 0.5*sqrt(s));
      p = applyRotation(vec3(p2, (noise(id*4.7)-0.5)*0.4), seedSlot);
    }
    return p;
  }
`;
