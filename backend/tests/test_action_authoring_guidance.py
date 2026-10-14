"""Authoring examples are checked against the existing runtime, without inference."""
import json
from pathlib import Path
import subprocess
import unittest

from app.services.flow_contract import FLOW_INSTRUCTIONS
from app.services.node_capability_service import CATALOG
from app.services.scenario_builder import GENERAL_BUILD_INSTRUCTIONS, REVIEW_INSTRUCTIONS


ROOT=Path(__file__).resolve().parents[2]
NODE_PROBE=r'''
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(0,'utf8'));
const bundle=await build({entryPoints:['src/utils/GraphEngine.ts'],bundle:true,platform:'node',format:'esm',write:false,tsconfig:'tsconfig.app.json',define:{'import.meta.env.VITE_API_URL':'""'}});
const {GraphEngine}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const requests=[];
const engine=new GraphEngine([],[],{executeWindowTargets:async targets=>{
  requests.push(targets);
  return {success:true,requested:targets,actual:{fl:0,fr:0,rl:0,rr:0},source:'test_adapter'};
}});
const allowed=new Set(['windows.open_all','windows.close_all','emergency.protocol','hazard_lights.on','hmi.reply']);
const responses=(data.responses||[]).map(value=>{
  const parsed=engine.parseStructuredActionPlan(JSON.stringify(value),'test input',false,allowed);
  return parsed?{accepted:true,action:parsed.action,actions:parsed.actions,reply:parsed.reply}:{accepted:false};
});
for(const area of data.areas||[]){
  await engine.processNodeLogic({id:'fixed',type:'car_control',data:{action:'windows',module:'vehicleControl',signalKey:'WINDOW_POSITION',function:'set',area,targetStatus:0}},
    {action:'windows.close_all',actions:[{name:'windows.close_all',parameters:{}}],reply:'request',strict_inference:true});
}
process.stdout.write(JSON.stringify({responses,targets:requests}));
'''


def runtime_probe(responses=None, areas=None):
    completed=subprocess.run(['node','--input-type=module','-e',NODE_PROBE],cwd=ROOT/'studio',
        input=json.dumps({'responses':responses or [],'areas':areas or []}),text=True,
        capture_output=True,check=True,timeout=15)
    return json.loads(completed.stdout)


def response_examples(text):
    """Extract executable response examples, independent of prose/spacing."""
    decoder=json.JSONDecoder();examples=[]
    for index,char in enumerate(text):
        if char!='{':continue
        try:value,_=decoder.raw_decode(text[index:])
        except ValueError:continue
        if isinstance(value,dict) and 'actions' in value and 'reply' in value:
            examples.append(value)
    return examples


class ActionAuthoringGuidanceTests(unittest.TestCase):
    def test_catalog_canonical_response_examples_are_accepted_by_actual_parser(self):
        examples=CATALOG['connection_contract']['producers']['llm']['formats']['actions'].get('canonical_response_examples',[])
        self.assertEqual(len(examples),2,'动作目录应提供实际动作与none的完整响应例子')
        parsed=runtime_probe(examples)['responses']
        self.assertTrue(all(value['accepted'] for value in parsed))
        self.assertEqual([value['action'] for value in parsed],['windows.close_all','none'])
        self.assertEqual(parsed[0]['actions'],[{'name':'windows.close_all','parameters':{}}])
        self.assertEqual(parsed[1]['actions'],[])
        for value in examples:
            self.assertIsInstance(value['parameters'],dict)
            self.assertEqual(value['action'],value['actions'][0]['name'] if value['actions'] else 'none')

    def test_shared_builder_and_review_examples_parse_with_runtime(self):
        for name,instructions in [('shared',FLOW_INSTRUCTIONS),('builder',GENERAL_BUILD_INSTRUCTIONS),('review',REVIEW_INSTRUCTIONS)]:
            with self.subTest(scope=name):
                examples=response_examples(instructions)
                self.assertGreaterEqual(len(examples),2,'共有说明应给出可解析的动作和无动作例子')
                parsed=runtime_probe(examples)['responses']
                self.assertTrue(all(value['accepted'] for value in parsed))
                self.assertIn('windows.close_all',[value['action'] for value in parsed])
                self.assertIn('none',[value['action'] for value in parsed])
                self.assertIn('car_control.data.action',instructions)

    def test_node_configuration_is_explicitly_separate_from_model_action_names(self):
        self.assertIn('car_control.data.action',CATALOG['nodes']['car_control']['description'])
        examples=CATALOG['connection_contract']['producers']['llm']['formats']['actions'].get('canonical_response_examples',[])
        self.assertTrue(examples)
        self.assertTrue(all(example['action']!='windows' for example in examples))
        bad=runtime_probe([{'action':'windows','actions':[{'name':'windows.close_all','parameters':{}}],'reply':'request'}])
        self.assertFalse(bad['responses'][0]['accepted'])

    def test_window_area_metadata_matches_actual_fixed_target_mapping(self):
        wanted={'0':['fl','fr','rl','rr'],'1':['fl'],'2':['fr'],'3':['rl'],'4':['rr'],'5':['fl','fr'],'6':['rl','rr']}
        documented=CATALOG['nodes']['car_control']['fields']['area'].get('window_area_targets')
        self.assertEqual(documented,wanted,'WINDOW_POSITION区域说明须来自实际执行映射，不能把3称为右后窗')
        targets=runtime_probe(areas=list(range(7)))['targets']
        self.assertEqual([sorted(value) for value in targets],[sorted(wanted[str(area)]) for area in range(7)])
        self.assertEqual(targets[3],{'rl':0})
        self.assertEqual(targets[4],{'rr':0})

    def test_wrong_author_templates_reject_while_canonical_same_intent_parses(self):
        responses=[
            {'actions':[{'action':'windows'}],'action':'windows','intent':'close_window','reply':'请求关闭指定车窗'},
            {'actions':[],'action':'','intent':'none','reply':'未执行动作'},
            {'actions':[{'name':'windows.close_all','parameters':{}}],'action':'windows.close_all','intent':'vehicle_control','parameters':{},'reply':'请求关闭指定车窗','confidence':0.96},
            {'actions':[],'action':'none','intent':'none','parameters':{},'reply':'未执行动作','confidence':0.96},
        ]
        parsed=runtime_probe(responses)['responses']
        self.assertEqual([value['accepted'] for value in parsed],[False,False,True,True])
        self.assertEqual(parsed[2]['actions'],[{'name':'windows.close_all','parameters':{}}])
        self.assertEqual(parsed[3]['actions'],[])

    def test_studio_generated_catalog_preserves_the_same_guidance(self):
        studio=json.loads((ROOT/'studio/src/data/nodeCapabilities.json').read_text(encoding='utf-8'))
        self.assertEqual(studio,CATALOG)


if __name__=='__main__':unittest.main()
