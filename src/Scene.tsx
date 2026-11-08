import { Component, type ReactNode, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, RoundedBox, Line, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import type { State, Action, Mission } from './engine';

type Props={state:State; mission:Mission; dispatch:(a:Action)=>void; cameraKey:number; demo:boolean};
function Box({pos,size,color,radius=.04}:{pos:[number,number,number];size:[number,number,number];color:string;radius?:number}){return <RoundedBox position={pos} args={size} radius={radius} smoothness={2} castShadow receiveShadow><meshStandardMaterial color={color}/></RoundedBox>}
function Nurse(){
  const arm=useRef<THREE.Group>(null);
  useFrame(({clock})=>{if(arm.current)arm.current.rotation.z=-.55+Math.sin(clock.elapsedTime*1.5)*.12;});
  return <group position={[1.85,0,-.55]} rotation={[0,-.3,0]}>
    <mesh position={[0,1.95,0]} castShadow><sphereGeometry args={[.22,24,24]}/><meshStandardMaterial color="#e7b69b"/></mesh>
    <mesh position={[0,2.07,-.025]}><sphereGeometry args={[.225,24,24,0,Math.PI*2,0,Math.PI*.5]}/><meshStandardMaterial color="#394a47"/></mesh>
    <Box pos={[0,2.17,0]} size={[.36,.13,.25]} color="#fafbf6"/>
    <Box pos={[0,2.2,.135]} size={[.035,.09,.012]} color="#3f8978"/><Box pos={[0,2.2,.14]} size={[.09,.03,.012]} color="#3f8978"/>
    {[-.075,.075].map(x=><mesh key={x} position={[x,1.97,.205]}><sphereGeometry args={[.015,8,8]}/><meshStandardMaterial color="#34423f"/></mesh>)}
    <Box pos={[0,1.42,0]} size={[.48,.68,.3]} color="#70a69d"/>
    <Box pos={[.12,1.57,.162]} size={[.12,.08,.015]} color="#fffdf6"/>
    {[-.14,.14].map(x=><group key={x}><Box pos={[x,.72,0]} size={[.18,.7,.23]} color="#f3f5ee"/><Box pos={[x,.31,.08]} size={[.22,.13,.38]} color="#e0e7dc"/></group>)}
    <group ref={arm} position={[-.3,1.65,0]}><Box pos={[0,-.25,0]} size={[.15,.52,.17]} color="#70a69d"/><mesh position={[0,-.55,0]}><sphereGeometry args={[.09,16,16]}/><meshStandardMaterial color="#e7b69b"/></mesh></group>
    <Box pos={[.32,1.39,0]} size={[.14,.6,.18]} color="#70a69d"/>
  </group>;
}
function Room({state,mission,dispatch,demo}:Props){
  const bag=useRef<THREE.Group>(null);
  const stream=useRef<THREE.Mesh>(null);
  useFrame(({clock},dt)=>{
    if(bag.current) bag.current.position.y=THREE.MathUtils.damp(bag.current.position.y,state.height,8,dt);
    if(stream.current)stream.current.scale.x=1+Math.sin(clock.elapsedTime*18)*.12;
    if(state.tap && state.fluid>0) dispatch({type:'tick',dt});
  });
  const tube=useMemo(()=>[[.15,1.39,.1],[.6,1.38,.2],[.9,1.1,.5],[1.07,state.height+.35,.82]] as [number,number,number][],[state.height]);
  return <>
    <color attach="background" args={['#e9eee8']}/><fog attach="fog" args={['#e9eee8',13,28]}/>
    <ambientLight intensity={1.5}/><directionalLight position={[3,7,5]} intensity={2.4} castShadow shadow-mapSize={[1024,1024]}/><hemisphereLight args={['#fff8df','#a0b4a9',1]}/>
    <group position={[-.45,0,0]}>
      <Box pos={[0,-.12,0]} size={[6.6,.2,5.4]} color="#d9d4c2"/>
      <Box pos={[0,1.65,-2.65]} size={[6.6,3.5,.12]} color="#e1e9de"/>
      <Box pos={[-3.25,1.65,0]} size={[.12,3.5,5.4]} color="#e9ede1"/>
      {Array.from({length:13},(_,i)=><Box key={i} pos={[-3+i*.5,-.012,0]} size={[.015,.008,5.2]} color="#c5c0ad" radius={.002}/>)}
      <Box pos={[-3.15,2,-.65]} size={[.06,1.55,1.8]} color="#a4c8c5"/>
      <Box pos={[-3.1,2,-.65]} size={[.08,1.65,.05]} color="#fcfcf3"/>
      <Box pos={[-3.1,2,-.65]} size={[.08,.05,1.9]} color="#fcfcf3"/>
      <Box pos={[-1.27,.85,-.1]} size={[2,.18,3.45]} color="#af9172"/>
      <Box pos={[-1.27,1.04,-.1]} size={[1.96,.28,3.3]} color="#f5f3e7"/>
      <Box pos={[-1.27,1.26,.28]} size={[1.94,.22,2.38]} color="#96b6aa"/>
      <Box pos={[-1.27,1.24,-1.24]} size={[1.28,.22,.6]} color="#fffdf5"/>
      <Box pos={[-1.27,1.05,-1.88]} size={[2.08,1.7,.12]} color="#b79c7e"/>
      {[-2.05,-.48].flatMap(x=>[-1.45,1.25].map(z=><Box key={`${x}${z}`} pos={[x,.41,z]} size={[.12,.8,.12]} color="#8d7964"/>))}
      <mesh position={[-1.27,1.49,-1.2]} rotation={[0,0,Math.PI/2]}><capsuleGeometry args={[.17,.33,6,16]}/><meshStandardMaterial color="#dab69e"/></mesh>
      <Box pos={[-1.27,1.39,-.22]} size={[.72,.2,1.28]} color="#b6caba"/>
      <Box pos={[.23,.9,.18]} size={[.08,.08,2.85]} color="#e7e7dd"/>
      {[-1,1.3].map(z=><Box key={z} pos={[.23,1.12,z]} size={[.07,.48,.07]} color="#e7e7dd"/>)}
      <Box pos={[-2.65,.58,-1.62]} size={[.65,1.1,.66]} color="#bcaa8b"/>
      <Box pos={[-2.65,1.16,-1.62]} size={[.74,.08,.74]} color="#e9e0cc"/>
      <mesh position={[-2.65,1.48,-1.62]}><cylinderGeometry args={[.25,.16,.4,24]}/><meshStandardMaterial color="#e9c790"/></mesh>
      <Box pos={[1.9,.075,1.55]} size={[1.45,.03,1.25]} color="#c5d3bd"/>
      <mesh position={[2.5,.3,-1.8]}><cylinderGeometry args={[.24,.18,.55,24]}/><meshStandardMaterial color="#bd9475"/></mesh>
      {[0,1,2,3,4].map(i=><mesh key={i} position={[2.5+Math.sin(i*2)*.17,.8+i*.09,-1.8+Math.cos(i*2)*.15]} rotation={[.3,i,.4]}><sphereGeometry args={[.18,12,12]}/><meshStandardMaterial color="#789b73"/></mesh>)}
      <Line points={tube} color="#e4c77e" lineWidth={5}/>
      <group ref={bag} position={[1.07,state.height,.82]} onClick={e=>{e.stopPropagation();dispatch({type:'select-bag'});}}>
        <RoundedBox args={[.53,.66,.12]} radius={.065} castShadow><meshPhysicalMaterial color={state.selected?'#cae8e0':'#e1f0e7'} transparent opacity={.65} roughness={.15} metalness={.05}/></RoundedBox>
        <Box pos={[0,-.29+state.fluid*.27,0]} size={[.46,Math.max(.015,state.fluid*.55),.08]} color="#dbb95c"/>
        <Box pos={[0,.32,0]} size={[.59,.055,.14]} color="#498c80"/>
        {[0,1,2,3].map(i=><Box key={i} pos={[.1,-.2+i*.12,.071]} size={[.1,.009,.005]} color="#78938a"/>)}
        <Box pos={[0,-.42,0]} size={[.06,.2,.06]} color="#e4c77e"/>
        <group onClick={e=>{e.stopPropagation();if(mission==='drain'&&!demo)dispatch({type:'tap'});}}>
          <Box pos={[.07,-.48,0]} size={[.2,.07,.09]} color={state.tap?'#dc9b50':'#4f8e80'}/>
        </group>
        {state.selected&&<mesh rotation={[Math.PI/2,0,0]} position={[0,0,-.1]}><torusGeometry args={[.43,.009,8,50]}/><meshBasicMaterial color="#2d8572"/></mesh>}
      </group>
      <group position={[state.container?1.07:2.1,.21,state.container?.82:1.6]} onClick={e=>{e.stopPropagation();if(mission==='drain'&&!demo)dispatch({type:'container'});}}>
        <mesh castShadow><cylinderGeometry args={[.29,.24,.38,32,1,true]}/><meshStandardMaterial color="#a7c9cd" side={THREE.DoubleSide}/></mesh>
        <mesh position={[0,-.17,0]}><cylinderGeometry args={[.24,.24,.04,32]}/><meshStandardMaterial color="#a7c9cd"/></mesh>
        {state.collected>0&&<mesh position={[0,-.15+state.collected*.3,0]}><cylinderGeometry args={[.24,.22,Math.max(.01,state.collected*.25),32]}/><meshStandardMaterial color="#dbb95c"/></mesh>}
      </group>
      {state.tap&&state.fluid>0&&<mesh ref={stream} position={[1.07,(state.height-.5+.4)/2,.82]}><cylinderGeometry args={[.015,.012,Math.max(.02,state.height-.9),8]}/><meshStandardMaterial color="#d9bb63" transparent opacity={.75}/></mesh>}
      <Nurse/>
    </group>
    <ContactShadows position={[0,.005,0]} opacity={.3} scale={10} blur={2.5} far={4}/>
  </>;
}
class Boundary extends Component<{children:ReactNode},{error:boolean}>{state={error:false};static getDerivedStateFromError(){return {error:true};}render(){return this.state.error?<div className="canvas-fallback">อุปกรณ์นี้เปิดฉาก 3D ไม่ได้<br/>ใช้ปุ่มควบคุมด้านข้างเพื่อทดสอบระบบต่อได้</div>:this.props.children;}}
export default function Scene(props:Props){const [ready,setReady]=useState(false);return <Boundary><Canvas shadows dpr={[1,1.6]} camera={{position:[7.1,5.7,8],fov:39}} fallback={<div className="canvas-fallback">เบราว์เซอร์นี้ไม่รองรับ WebGL ใช้ปุ่มควบคุมเพื่อทดลองต่อได้</div>} onCreated={({gl})=>{gl.xr.enabled=true;setReady(true);}}><Room {...props}/><OrbitControls key={props.cameraKey} makeDefault target={[-.2,1,0]} minDistance={4} maxDistance={13} minPolarAngle={.25} maxPolarAngle={Math.PI/2.08} enablePan={false}/></Canvas>{!ready&&<span className="scene-loading">กำลังเตรียมฉาก 3D…</span>}</Boundary>}
