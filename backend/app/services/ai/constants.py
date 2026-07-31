from app.core.enums import AIProvider

AI_PROVIDER_TIMEOUT = 120

# Таймаут HTTP-запроса на провайдера. Локальная Ollama грузит модель и считает
# на CPU/GPU пользователя — тяжёлый кадр не укладывается в облачные сроки.
# Облачным даём короткий таймаут, чтобы быстрее отдавать управление по кольцу.
AI_PROVIDER_TIMEOUTS: dict[AIProvider, float] = {
    AIProvider.OLLAMA: 240.0,
    AIProvider.GEMINI: 60.0,
    AIProvider.OPENROUTER: 60.0,
}


def get_provider_timeout(provider: AIProvider) -> float:
    return AI_PROVIDER_TIMEOUTS.get(provider, float(AI_PROVIDER_TIMEOUT))


# Кольцо переключений: у каждого провайдера ровно один преемник, обход
# замыкается на стартовом. MOCK работает без fallback.
FALLBACK_NEXT_PROVIDER: dict[AIProvider, AIProvider | None] = {
    AIProvider.OLLAMA: AIProvider.GEMINI,
    AIProvider.GEMINI: AIProvider.OPENROUTER,
    AIProvider.OPENROUTER: AIProvider.OLLAMA,
    AIProvider.MOCK: None,
}

# Бюджет повторных попыток на один файл. Ограничение по времени, а не по числу
# кругов: при одном провайдере файл получает столько же времени, сколько при
# трёх. Рассчитан так, чтобы после полного таймаута Ollama (240 с) осталось
# время на ожидание cooldown облачного провайдера (30 с) и один облачный
# retry (60 с) с запасом.
AI_FALLBACK_BUDGET_SECONDS = 420.0
# Страховка от busy-loop, если провайдеры падают мгновенно.
AI_FALLBACK_MAX_CYCLES = 8
AI_FALLBACK_CYCLE_BASE_DELAY = 2.0
AI_FALLBACK_CYCLE_MAX_DELAY = 60.0

RETRYABLE_HTTP_STATUSES = frozenset({429, 500, 502, 503, 504})
PROVIDER_COOLDOWN_DEFAULT_SECONDS = 30.0
PROVIDER_COOLDOWN_MAX_SECONDS = 120.0
# Штраф за таймаут: провайдер, не уложившийся в свой таймаут, отправляется
# остывать дольше обычного — иначе круг снова упирается в него и съедает
# бюджет, пока остывающий рабочий провайдер ждёт рядом.
PROVIDER_TIMEOUT_COOLDOWN_SECONDS = 90.0

# Адаптивная ёмкость параллельных запросов на провайдера (AIMD): после 429
# ёмкость сужается вдвое, после серии успехов растёт на 1. Держит облачные
# провайдеры на их безопасном уровне, не срезая общий throughput.
THROTTLE_START_LIMIT = 3.0
THROTTLE_MIN_LIMIT = 1.0
THROTTLE_MAX_LIMIT = 3.0
THROTTLE_DECREASE_FACTOR = 0.5
THROTTLE_INCREASE_AFTER_SUCCESSES = 5
