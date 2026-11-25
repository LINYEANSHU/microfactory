module.exports = async ({ send, evaluate, wait }) => {
  await wait("document.querySelector('#ui #topbar') && document.querySelector('canvas')");
  await evaluate("document.querySelector('#modal-back:not(.hidden) #modal-actions button.primary')?.click()");
  await wait("document.querySelector('#modal-back.hidden')");
  await evaluate("document.querySelector('#b-help').click()");
  await wait("document.querySelector('#modal-back:not(.hidden)')");
  const escape = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 };
  await send('Input.dispatchKeyEvent', { ...escape, type: 'rawKeyDown' });
  await send('Input.dispatchKeyEvent', { ...escape, type: 'keyUp' });
  await wait("document.querySelector('#modal-back.hidden')");
};
