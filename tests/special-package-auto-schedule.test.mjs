import test from 'node:test';
import assert from 'node:assert/strict';
import {excursionComponents,isDroneRequiredTrip,isSnorkelingTrip,scheduleCanServeRequest} from '../lib/excursion-operations.ts';

test('Special Package is recognized as its six included excursion components',()=>{
 assert.deepEqual(excursionComponents('Special Package'),['turtle','shark','sandbank','coral garden','dolphin','fishing']);
 assert.equal(isSnorkelingTrip('Special Package'),true);
 assert.equal(isDroneRequiredTrip('Special Package'),true);
});

test('Special Package can auto-match a compatible full-package schedule',()=>{
 assert.equal(scheduleCanServeRequest('Special Package','Special Package'),true);
 assert.equal(scheduleCanServeRequest('Special Package','Turtle + Shark + Sandbank + Coral Garden + Dolphin Watching + Fishing with Dinner'),true);
});

test('partial standard trips do not falsely satisfy the whole Special Package',()=>{
 assert.equal(scheduleCanServeRequest('Special Package','Turtle Snorkeling + Coral Garden Snorkeling'),false);
 assert.equal(scheduleCanServeRequest('Special Package','Shark Snorkeling (Nurse Shark) + Turtle Snorkeling'),false);
 assert.equal(scheduleCanServeRequest('Special Package','Dolphin Watching + Fishing with Dinner'),false);
});
