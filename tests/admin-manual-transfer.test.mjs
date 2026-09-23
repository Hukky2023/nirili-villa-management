import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const panelPath='app/transport-panel.tsx';
const routePath='app/api/transport/route.ts';
const panel=readFileSync(new URL('../'+panelPath,import.meta.url),'utf8');
const route=readFileSync(new URL('../'+routePath,import.meta.url),'utf8');

test('manual guest transfer UI and API compile',()=>{
 const panelResult=ts.transpileModule(panel,{fileName:panelPath,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});
 const routeResult=ts.transpileModule(route,{fileName:routePath,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true});
 assert.deepEqual((panelResult.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')),[]);
 assert.deepEqual((routeResult.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')),[]);
});

test('Admin manual guest transfer flow stays fully linked',()=>{
 assert.match(panel,/Manual Guest Transfer/);
 assert.match(panel,/Create & assign guest transfer/);
 assert.match(panel,/action:'manual-guest-transfer'/);
 assert.match(route,/b\.action==='manual-guest-transfer'/);
 assert.match(route,/Only Admin can create a linked guest transfer manually/);
 assert.match(route,/Select one valid seat for every adult and child/);
 assert.match(route,/syncTransportBuggy\(hotel\.state,stay,leg,journey\)/);
 assert.match(route,/syncTransportPlanBill\(hotel\.state,stay,booking,sailing,leg,u\.username\)/);
 assert.match(route,/sendTransportScheduleEmail\(transportMail\)/);
});

test('manual transfer exposes active hotel guests only to Admin',()=>{
 assert.match(route,/const guestStays=u\.role==='admin'/);
 assert.match(route,/\['Confirmed','In House'\]/);
 assert.match(panel,/data\?\.guestStays/);
});
