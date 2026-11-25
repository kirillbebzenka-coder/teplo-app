// Terminal orders belong only to history, including when progress is unavailable.
const terminal = new Set(['delivered', 'completed', 'cancelled']);
export function buyerOrderFinished(order, progress) {
 return [progress?.state, order.status, order.is_test ? order.demo_status : null].some(value => terminal.has(value));
}
export function buyerOrderStatus(order, progress) {
 const state=[progress?.state,order.status,order.is_test?order.demo_status:null];
 if(state.includes('cancelled'))return 'Отменён';
 if(buyerOrderFinished(order,progress))return 'Доставлен';
 return progress?.message || 'Ожидает обновления статуса';
}
