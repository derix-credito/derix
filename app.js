/* =====================================================================
   DERIX — página de entrada com digital / reconhecimento facial
   PREENCHA AS DUAS LINHAS ABAIXO (veja o passo a passo):
   ===================================================================== */
var API_URL = 'https://script.google.com/macros/s/AKfycbyidOeawyI74pLWGxdbSMwBGQZdrpqR7_eFQAcd8UC8rsnEHTvIu3uzLYOPcFf5hMtEyQ/exec';   // implantação "Qualquer pessoa" (termina em /exec)
var APP_URL = 'https://script.google.com/macros/s/AKfycbzmFNQiR8W4MFQPUziz0wMKiOjjOvCOJEqidQXyMEgKAovYhW-KjjyrvQt3LervF77iAw/exec';         // implantação "Somente eu" do app (termina em /exec)
/* ===================================================================== */

(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function msg(id, t, tipo) { var m = $(id); m.textContent = t || ''; m.className = 'msg ' + (t ? (tipo || 'erro') : ''); }
  function tela(id) { ['tEntrar', 'tCadastro'].forEach(function (t) { $(t).classList.toggle('ativa', t === id); }); window.scrollTo(0, 0); }
  function ocupado(btn, on) { btn.disabled = !!on; btn.classList.toggle('ocupado', !!on); }

  // ---------- base64url <-> bytes ----------
  function b64uParaBytes(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    var bin = atob(s), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function bytesParaB64u(buf) {
    var u = new Uint8Array(buf), s = '';
    for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // ---------- servidor DERIX (Apps Script) ----------
  function api(dados) {
    return fetch(API_URL, {
      method: 'POST', redirect: 'follow', credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // sem "preflight" CORS
      body: JSON.stringify(dados)
    }).then(function (r) {
      if (!r.ok) throw new Error('Servidor DERIX indisponível (' + r.status + ').');
      return r.json();
    }).then(function (j) {
      if (!j || j.erro) throw new Error((j && j.erro) || 'Resposta inválida do servidor.');
      return j;
    });
  }

  function configurada() { return /^https:\/\/script\.google\.com\//.test(API_URL) && /^https:\/\/script\.google\.com\//.test(APP_URL); }

  function erroAmigavel(e) {
    var n = e && e.name, m = String(e && e.message || e);
    if (n === 'NotAllowedError') return 'Não confirmado. Toque de novo e use o rosto ou a digital. Se este aparelho ainda não foi cadastrado, toque em "Cadastrar este aparelho".';
    if (n === 'InvalidStateError') return 'Este aparelho já está cadastrado. Volte e use "Entrar com digital ou rosto".';
    if (n === 'SecurityError') return 'Endereço da página não confere com o configurado no BIOMETRIA.gs (ORIGEM / RP_ID).';
    if (n === 'NotSupportedError') return 'Este aparelho não oferece digital/rosto para sites.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sem conexão com o servidor DERIX. Verifique a internet.';
    return m;
  }

  // O iPhone (Safari) exige que a biometria seja pedida logo no toque do botão.
  // Por isso o desafio do servidor é buscado ANTES (ao abrir a página) e renovado a cada 2 minutos.
  var DESAFIO = null, OPCOES = null, CODIGO_OPCOES = '';
  function buscarDesafio() {
    if (!configurada()) return Promise.resolve(null);
    return api({ acao: 'desafioEntrar' }).then(function (d) { DESAFIO = { d: d, t: Date.now() }; return DESAFIO; })
      .catch(function (e) { DESAFIO = null; msg('eMsg', erroAmigavel(e)); return null; });
  }
  function desafioValido() { return DESAFIO && (Date.now() - DESAFIO.t) < 150000; }

  // ---------- ENTRAR ----------
  function entrar() {
    var b = $('bEntrar');
    if (!configurada()) { msg('eMsg', 'Página ainda não configurada (API_URL e APP_URL no app.js).'); return; }
    if (!desafioValido()) { msg('eMsg', 'Preparando… toque de novo em 2 segundos.', 'ok'); buscarDesafio().then(function (x) { if (x) msg('eMsg', 'Pronto. Toque no botão verde.', 'ok'); }); return; }
    var d = DESAFIO.d; DESAFIO = null;          // cada desafio só serve uma vez
    ocupado(b, true); msg('eMsg', 'Confirme com o rosto ou a digital…', 'ok');
    navigator.credentials.get({ publicKey: {
      challenge: b64uParaBytes(d.desafio), rpId: d.rpId, timeout: 60000,
      userVerification: 'required', allowCredentials: []
    } }).then(function (cred) {
      if (!cred) throw new Error('Nenhuma chave escolhida.');
      msg('eMsg', 'Conferindo…', 'ok');
      return api({ acao: 'entrar', id: cred.id,
        clientDataJSON: bytesParaB64u(cred.response.clientDataJSON),
        authenticatorData: bytesParaB64u(cred.response.authenticatorData),
        signature: bytesParaB64u(cred.response.signature) });
    }).then(function (r) {
      msg('eMsg', '✅ Confirmado! Abrindo o DERIX…', 'ok');
      window.location.replace(APP_URL + '?bilhete=' + encodeURIComponent(r.bilhete));
    }).catch(function (e) { ocupado(b, false); msg('eMsg', erroAmigavel(e)); buscarDesafio(); });
  }

  // ---------- CADASTRAR APARELHO ----------
  function nomePadrao() {
    var u = navigator.userAgent;
    if (/iPhone/.test(u)) return 'iPhone';
    if (/iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1)) return 'iPad';
    if (/Android/.test(u)) return 'Celular Android';
    if (/Windows/.test(u)) return 'Computador Windows';
    if (/Macintosh/.test(u)) return 'Mac';
    return 'Aparelho';
  }
  // ao completar os 8 números, já confere o código e prepara o cadastro
  function prepararCadastro() {
    var codigo = $('cCodigo').value.replace(/\D/g, '');
    OPCOES = null; CODIGO_OPCOES = '';
    if (codigo.length !== 8 || !configurada()) return;
    msg('cMsg', 'Conferindo o código…', 'ok'); $('bCadastrar').disabled = true;
    api({ acao: 'opcoesCadastro', codigo: codigo }).then(function (o) {
      if ($('cCodigo').value.replace(/\D/g, '') !== codigo) return;
      OPCOES = { o: o, t: Date.now() }; CODIGO_OPCOES = codigo;
      $('bCadastrar').disabled = false; msg('cMsg', 'Código aceito. Toque no botão verde.', 'ok');
    }).catch(function (e) { $('bCadastrar').disabled = false; msg('cMsg', erroAmigavel(e)); });
  }
  function cadastrar() {
    var b = $('bCadastrar'), codigo = $('cCodigo').value.replace(/\D/g, ''), nome = $('cNome').value.trim() || nomePadrao();
    if (!configurada()) { msg('cMsg', 'Página ainda não configurada (API_URL e APP_URL no app.js).'); return; }
    if (codigo.length !== 8) { msg('cMsg', 'Digite o código de 8 números gerado no app.'); return; }
    if (!OPCOES || CODIGO_OPCOES !== codigo || (Date.now() - OPCOES.t) > 150000) { prepararCadastro(); return; }
    var o = OPCOES.o; OPCOES = null;
    ocupado(b, true); msg('cMsg', 'Confirme com o rosto ou a digital…', 'ok');
    navigator.credentials.create({ publicKey: {
      challenge: b64uParaBytes(o.desafio),
      rp: { id: o.rpId, name: 'DERIX Empréstimos' },
      user: { id: b64uParaBytes(o.userId), name: o.userName, displayName: 'DERIX – ' + o.userName },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      excludeCredentials: (o.excluir || []).map(function (id) { return { type: 'public-key', id: b64uParaBytes(id) }; }),
      attestation: 'none', timeout: 90000
    } }).then(function (cred) {
      msg('cMsg', 'Gravando…', 'ok');
      return api({ acao: 'cadastrar', codigo: codigo, nome: nome,
        clientDataJSON: bytesParaB64u(cred.response.clientDataJSON),
        attestationObject: bytesParaB64u(cred.response.attestationObject) });
    }).then(function (r) {
      ocupado(b, false); $('cCodigo').value = '';
      msg('cMsg', '✅ "' + r.nome + '" cadastrado! Agora é só entrar com o rosto ou a digital.', 'ok');
      setTimeout(function () { tela('tEntrar'); buscarDesafio(); msg('eMsg', 'Aparelho cadastrado. Toque no botão verde para entrar.', 'ok'); }, 2500);
    }).catch(function (e) { ocupado(b, false); msg('cMsg', erroAmigavel(e)); });
  }

  // ---------- início ----------
  function iniciar() {
    $('bEntrar').addEventListener('click', entrar);
    $('bCadastrar').addEventListener('click', cadastrar);
    $('irCadastro').addEventListener('click', function () { tela('tCadastro'); $('cNome').value = $('cNome').value || nomePadrao(); $('cCodigo').focus(); });
    $('voltar').addEventListener('click', function () { tela('tEntrar'); });
    $('cCodigo').addEventListener('input', function () { var d = this.value.replace(/\D/g, '').slice(0, 8); this.value = d.length > 4 ? d.slice(0, 4) + '-' + d.slice(4) : d; if (d.length === 8 && d !== CODIGO_OPCOES) prepararCadastro(); });
    $('lSenha').addEventListener('click', function (e) { e.preventDefault(); if (configurada()) window.location.href = APP_URL; else msg('eMsg', 'Página ainda não configurada (APP_URL no app.js).'); });
    if (location.hash === '#cadastrar') { tela('tCadastro'); $('cNome').value = nomePadrao(); }
    buscarDesafio(); setInterval(function () { if (!document.hidden && !desafioValido()) buscarDesafio(); }, 30000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && !desafioValido()) buscarDesafio(); });

    var aviso = '';
    if (!window.PublicKeyCredential || !navigator.credentials) aviso = 'Este navegador não aceita digital/rosto. Abra esta página no <b>Safari</b> (iPhone/Mac), <b>Chrome</b> ou <b>Edge</b>.';
    else if (/FBAN|FBAV|Instagram|WhatsApp|GSA\/|Line\//.test(navigator.userAgent)) aviso = 'Abra esta página direto no <b>Safari</b> ou <b>Chrome</b> (não dentro do WhatsApp, Gmail ou Instagram).';
    if (aviso) { $('semSuporte').innerHTML = aviso; $('semSuporte').style.display = 'block'; }
    else if (PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(function (ok) {
        if (!ok) { $('semSuporte').innerHTML = 'Este aparelho não tem Face ID, digital ou Windows Hello ativado. No Windows: Configurações → Contas → Opções de entrada → Windows Hello.'; $('semSuporte').style.display = 'block'; }
      }).catch(function () {});
    }
  }
  iniciar();
})();
