import {expect,it} from 'vitest';
import {parseDecomposedLayers} from './layerDecomposition';
const base={url:'https://example.com/base.png',size:'2048x2048',z_index:0};
const layer={url:'https://example.com/layer.png',size:'200x100',z_index:1,bounding_box:{absolute:[10,20,209,119]},name:'人物'};
it('preserves transparent layer order, names, sizes and placement',()=>{
  expect(parseDecomposedLayers({data:[layer,base]})).toEqual([
    {url:base.url,width:2048,height:2048,zIndex:0,name:'底图'},
    {url:layer.url,width:200,height:100,zIndex:1,name:'人物',bounds:[10,20,209,119]},
  ]);
});
it('rejects ordinary generation results and malformed layers',()=>{
  expect(()=>parseDecomposedLayers({data:[base]})).toThrow('独立图层');
  expect(()=>parseDecomposedLayers({data:[base,{...layer,bounding_box:undefined}]})).toThrow('位置坐标');
  expect(()=>parseDecomposedLayers({data:[base,{...layer,z_index:0}]})).toThrow('重复');
});

it('keeps all images in the successful gateway task envelope without inventing coordinates',()=>{
 const result=parseDecomposedLayers({status:'SUCCESS',data:{data:[{url:'https://example.com/a.png',b64_json:''},{url:'https://example.com/b.png',b64_json:''}]}});
 expect(result).toHaveLength(2);
 expect(result[0]).toMatchObject({name:'图层 1',placement:'separate',width:0,height:0});
 expect(result[1].bounds).toBeUndefined();
 expect(()=>parseDecomposedLayers({data:[{url:'javascript:bad'},{url:'https://example.com/b.png'}]})).toThrow();
});
