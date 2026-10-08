# cc-mods

Mody (pluginy z function hooks) do Claude Code.

## agent-lens

Pasek nad promptem, widoczny caly czas:

- **zwiniety** (1 linia): model sesji glownej, % okna kontekstu (kolor: zielony < 60%, zolty < 80%, czerwony), koszt sesji w USD, liczba aktywnych subagentow z rozkladem modeli, ETA calego zadania, tryb doboru modeli.
- **rozwiniety** (`[wiecej]`): tabela agentow — status, model, typ, opis, tokeny in/out, czas pracy, ETA, skad wybor modelu.
- `[-]` silnika ukrywa pasek calkowicie.

Automatyczny dobor modelu subagentow (hook `agent.spawn`):

| Sytuacja | Model |
| --- | --- |
| model podany jawnie w wywolaniu Agent | bez zmian |
| fork / agent z wlasna definicja (plugin, `.claude/agents`) | bez zmian |
| `Explore`, `claude-code-guide`, `statusline-setup` | haiku |
| `Plan` | opus |
| opis/prompt: architektura, security, audyt, root cause, migracja, refaktor | opus |
| opis: szukaj/znajdz/wylistuj/policz/podsumuj | haiku |
| pozostale (implementacja) | sonnet |

Nigdy powyzej modelu sesji glownej (to Twoj limit kosztowy).

ETA jest szacunkiem: srednia ruchoma czasu trwania wg (typ agenta, model), zapamietywana miedzy sesjami. `?` = brak historii, `+1m` = dluzej niz zwykle.

Komendy: `/agent-lens` (status i statystyki ETA), `/agent-lens auto|suggest|off`, `/agent-lens expand|collapse`, `/agent-lens reset`.

### Instalacja

```
/plugin install agent-lens --marketplace marixis908/cc-mods
```

Potem `y` (dodanie marketplace) i wybor zakresu (user).

Rozwoj lokalnie: `claude --plugin-dir ./agent-lens`. Testy: `claude plugin test agent-lens`.
