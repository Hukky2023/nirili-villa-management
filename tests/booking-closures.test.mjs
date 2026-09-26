import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),ts=require('typescript');
function load(file){
 const m={exports:{}};
 const src=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',src)(id=>load('../lib/'+id.replace('./','')+'.ts'),m,m.exports);
 return m.exports;
}

const {bookingClosureForStay,bookingClosureThrough,closeBookingDates,isBookingDateClosed,reopenBookingDates}=load('../lib/booking-closures.ts');

test('closed booking range blocks every overlapping stay night',()=>{
 const state={bookingClosures:[{id:'CLOSE-1',start:'2026-10-10',endExclusive:'2026-10-13',reason:'Private use',createdAt:'',createdBy:'Admin'}]};
 assert.equal(isBookingDateClosed(state,'2026-10-09'),false);
 assert.equal(isBookingDateClosed(state,'2026-10-10'),true);
 assert.equal(isBookingDateClosed(state,'2026-10-12'),true);
 assert.equal(isBookingDateClosed(state,'2026-10-13'),false);
 assert.equal(bookingClosureForStay(state,'2026-10-09','2026-10-10'),null);
 assert.equal(bookingClosureForStay(state,'2026-10-09','2026-10-11')?.id,'CLOSE-1');
 assert.equal(bookingClosureForStay(state,'2026-10-12','2026-10-14')?.id,'CLOSE-1');
});

test('admin closes inclusive dates and can reopen them',()=>{
 const state={bookingClosures:[]};
 const closure=closeBookingDates(state,{from:'2026-11-01',through:'2026-11-03',reason:'Group hold',by:'Admin'});
 assert.equal(closure.start,'2026-11-01');
 assert.equal(closure.endExclusive,'2026-11-04');
 assert.equal(bookingClosureThrough(closure),'2026-11-03');
 assert.equal(bookingClosureForStay(state,'2026-11-02','2026-11-03')?.id,closure.id);
 const reopened=reopenBookingDates(state,closure.id);
 assert.equal(reopened.id,closure.id);
 assert.equal(state.bookingClosures.length,0);
});

test('overlapping closures are rejected so reopen behaviour stays clear',()=>{
 const state={bookingClosures:[]};
 closeBookingDates(state,{from:'2026-12-01',through:'2026-12-04',by:'Admin'});
 assert.throws(()=>closeBookingDates(state,{from:'2026-12-04',through:'2026-12-06',by:'Admin'}),/already closed/);
});
