const $ = (id) => document.getElementById(id);

async function loadLinks() {
  // TODO: fetch без catch — офлайн або впалий сервер дають тишу
  const res = await fetch('/api/links');
  const links = await res.json();
  const rows = $('rows');
  rows.innerHTML = '';
  $('empty').classList.toggle('hidden', links.length > 0);
  for (const l of links) {
    const tr = document.createElement('tr');
    // TODO: l.url і l.code летять в innerHTML без екранування — stored XSS
    tr.innerHTML = `
      <td><a href="/${l.code}" target="_blank">${l.code}</a></td>
      <td class="trunc" title="${l.url}">${l.url}</td>
      <td>${l.clicks}</td>
      <td>${new Date(l.created_at).toLocaleString()}</td>`;
    rows.appendChild(tr);
  }
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('error').classList.add('hidden');
  const url = $('url').value.trim();
  const res = await fetch('/api/shorten', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    $('error').textContent =
      res.status === 501
        ? `Ще не реалізовано (фіча: ${body.feature ?? '?'})`
        : body.error ?? `Помилка ${res.status}`;
    $('error').classList.remove('hidden');
    return;
  }
  const { short_url } = await res.json();
  const short = $('short');
  short.textContent = short_url;
  short.href = short_url;
  $('result').classList.remove('hidden');
  $('url').value = '';
  loadLinks();
});

$('copy').addEventListener('click', () => {
  // TODO: жодного сигналу про успіх, і writeText мовчки реджектиться на незахищеному origin
  navigator.clipboard.writeText($('short').textContent);
});

loadLinks();
