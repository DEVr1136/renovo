# Ambiente Digital Renovo - Modulo de Celulas

Base inicial (MVP) para iniciar o ambiente digital da igreja pelo modulo de celulas.

## O que ja funciona

- Cadastro de celulas
- Cadastro de membros por celula
- Dashboard com totais
- Login, logout e sessao persistida
- Gestao de acessos (somente Pastor/Admin)
  - Criar usuario
  - Editar perfil, celula vinculada e senha
  - Excluir usuario com protecao de ultimo admin/pastor
- Relatorio semanal completo da celula
  - Lista de membros
  - Marcacao de presentes
  - Faltaram calculado automaticamente
  - Visitantes, oferta e indicadores finais
  - Texto final pronto para copiar e enviar
- Persistencia local no navegador (localStorage)

## Como usar

1. Abra `index.html` no navegador.
2. Entre com `admin / 123456`.
3. O sistema ja abre com um exemplo pre-cadastrado da celula PRETA (24/02/2026).
4. Para gerir usuarios, abra o card "Gerenciar acessos".
5. No perfil de lider, somente o card "Relatorio semanal" fica visivel para alimentar as informacoes da celula vinculada.
6. Edite os dados se quiser e clique em "Gerar relatorio final".
7. Use "Copiar texto" para enviar o resultado.

## Proximos passos sugeridos

1. Login de lideres e supervisores
2. Registro semanal de presenca
3. Relatorios (crescimento, frequencia, novos convertidos)
4. Banco de dados online e backup automatico
