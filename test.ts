import { setContext, EventBus, PrepTask } from './generated';

setContext({ user: { id: 'u1', role: 'cook' } });

const t = new PrepTask({
  id: 't1',
  name: 'Chop onions',
  priority: 4,
});

console.log('isUrgent:', t.isUrgent.value);

EventBus.subscribe('kitchen.task.claimed', (d) => {
  console.log('EVENT:', d);
});

t.claim('u1');

console.log(t.status.value);
console.log(t.assignedTo.value);
