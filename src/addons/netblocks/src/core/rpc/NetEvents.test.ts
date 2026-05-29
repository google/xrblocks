import {describe, expect, it, vi} from 'vitest';

import {NetMessage, RpcMessage} from '../codec/MessageCodec';

import {NetEvents, typedEvents} from './NetEvents';

function makeEvents() {
  const sent: NetMessage[] = [];
  const events = new NetEvents((msg) => sent.push(msg));
  return {events, sent};
}

describe('NetEvents', () => {
  it('emit() sends a broadcast rpc envelope', () => {
    const {events, sent} = makeEvents();
    events.emit('chat', {text: 'hi'});
    expect(sent).toEqual([{type: 'rpc', topic: 'chat', payload: {text: 'hi'}}]);
  });

  it('emitTo() sets the `to` field for unicast', () => {
    const {events, sent} = makeEvents();
    events.emitTo('peer-B', 'ping', 42);
    expect(sent).toEqual([
      {type: 'rpc', topic: 'ping', payload: 42, to: 'peer-B'},
    ]);
  });

  it('on() returns an unsubscribe function that removes only that handler', () => {
    const {events} = makeEvents();
    const a = vi.fn();
    const b = vi.fn();
    const offA = events.on('chat', a);
    events.on('chat', b);
    offA();
    events._dispatch({
      type: 'rpc',
      topic: 'chat',
      payload: 'hello',
      from: 'peer-A',
    } as RpcMessage);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith('hello', 'peer-A');
  });

  it('off() removes a handler', () => {
    const {events} = makeEvents();
    const handler = vi.fn();
    events.on('chat', handler);
    events.off('chat', handler);
    events._dispatch({
      type: 'rpc',
      topic: 'chat',
      payload: 'hi',
      from: 'peer-A',
    } as RpcMessage);
    expect(handler).not.toHaveBeenCalled();
  });

  it('_dispatch fans out to every subscriber of a topic', () => {
    const {events} = makeEvents();
    const a = vi.fn();
    const b = vi.fn();
    events.on('chat', a);
    events.on('chat', b);
    events._dispatch({
      type: 'rpc',
      topic: 'chat',
      payload: {text: 'yo'},
      from: 'peer-A',
    } as RpcMessage);
    expect(a).toHaveBeenCalledWith({text: 'yo'}, 'peer-A');
    expect(b).toHaveBeenCalledWith({text: 'yo'}, 'peer-A');
  });

  it('_dispatch ignores topics with no subscribers', () => {
    const {events} = makeEvents();
    expect(() =>
      events._dispatch({
        type: 'rpc',
        topic: 'unknown',
        payload: null,
        from: 'peer-A',
      } as RpcMessage)
    ).not.toThrow();
  });

  it('_dispatch ignores messages with no `from`', () => {
    const {events} = makeEvents();
    const handler = vi.fn();
    events.on('chat', handler);
    events._dispatch({type: 'rpc', topic: 'chat', payload: 'x'} as RpcMessage);
    expect(handler).not.toHaveBeenCalled();
  });

  it('a throwing handler does not break sibling handlers', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const {events} = makeEvents();
    const survivor = vi.fn();
    events.on('chat', () => {
      throw new Error('boom');
    });
    events.on('chat', survivor);
    events._dispatch({
      type: 'rpc',
      topic: 'chat',
      payload: 'x',
      from: 'peer-A',
    } as RpcMessage);
    expect(survivor).toHaveBeenCalledWith('x', 'peer-A');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('typedEvents', () => {
  it('routes typed calls through the underlying NetEvents instance', () => {
    type EventMap = {
      chat: {text: string};
      ping: number;
    };
    const {events, sent} = makeEvents();
    const typed = typedEvents<EventMap>(events);

    const chatHandler = vi.fn();
    typed.on('chat', chatHandler);

    typed.emit('ping', 7);
    typed.emitTo('peer-B', 'chat', {text: 'hi'});

    expect(sent).toEqual([
      {type: 'rpc', topic: 'ping', payload: 7},
      {type: 'rpc', topic: 'chat', payload: {text: 'hi'}, to: 'peer-B'},
    ]);

    events._dispatch({
      type: 'rpc',
      topic: 'chat',
      payload: {text: 'yo'},
      from: 'peer-A',
    } as RpcMessage);
    expect(chatHandler).toHaveBeenCalledWith({text: 'yo'}, 'peer-A');
  });
});
