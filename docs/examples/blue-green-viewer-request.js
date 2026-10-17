// ブルーグリーン（stable/canary）デプロイパターン: CloudFront Functions
// viewer-request関数のコピー＆調整用テンプレート。
// 詳細は ../blue-green-stage-pattern.md 「CloudFront Functionsによる重み付けルーティング」を参照。
//
// KVSキー名（canary_weight・force_stable・canary_exists）は同ドキュメントの既定キーと
// 一致させている。別名にする場合は該当箇所を書き換える。CloudFormationテンプレートの
// FunctionCode: | 直下へそのまま貼り付けて使う。

import cf from 'cloudfront';

var KVS_WEIGHT_KEY = 'canary_weight';
var KVS_FORCE_STABLE_KEY = 'force_stable';
var KVS_CANARY_EXISTS_KEY = 'canary_exists';
var DEFAULT_WEIGHT_PERCENT = 10;
var COOKIE_NAME = 'canary';
var NEW_ASSIGNMENT_HEADER = 'x-bg-new-assignment';

async function handler(event) {
    var request = event.request;

    var kvsHandle = cf.kvs();

    // 明示的に/stable/または/canary/で始まるリクエストは、重み付け抽選を行わず
    // そのまま通す（手動切り替えリンクパターンとの前方互換のため）。これが無いと
    // プレフィックスが二重に付与されてしまう
    var isExplicitStable = request.uri === '/stable' || request.uri.indexOf('/stable/') === 0;
    var isExplicitCanary = request.uri === '/canary' || request.uri.indexOf('/canary/') === 0;
    if (isExplicitStable || isExplicitCanary) {
        // canaryスタック自体が存在しない状態（昇格直後でまだ新規canaryが作られて
        // いない等）で/canary/へ明示アクセスすると、S3に対応するオブジェクトが無く
        // index.html自体を取得できないため白画面になる。canary_existsがtrueでない
        // 場合は/stable/への明示アクセスと同様に扱う
        if (isExplicitCanary) {
            var canaryExists = false;
            try {
                var canaryExistsValue = await kvsHandle.get(KVS_CANARY_EXISTS_KEY);
                canaryExists = canaryExistsValue === 'true';
            } catch (err) {
                // KVSに未設定の場合は既定値(false)のまま進める
            }
            if (!canaryExists) {
                isExplicitCanary = false;
                isExplicitStable = true;
                request.uri = request.uri.replace(/^\/canary/, '/stable');
            }
        }
        if (request.uri.endsWith('/')) {
            request.uri += 'index.html';
        }
        // /stable/への明示アクセスを、以後の通常アクセス（Cookie無し判定）でも
        // 継続してstableへ固定する（ErrorBoundary連動の自動フォールバック等）
        if (isExplicitStable) {
            request.headers[NEW_ASSIGNMENT_HEADER] = { value: 'stable' };
        }
        return request;
    }

    var forceStable = false;
    try {
        var forceStableValue = await kvsHandle.get(KVS_FORCE_STABLE_KEY);
        forceStable = forceStableValue === 'true';
    } catch (err) {
        // KVSに未設定の場合は既定値(false)のまま進める
    }

    var bucket;
    var isNewAssignment = false;

    if (forceStable) {
        bucket = 'stable';
    } else {
        var existingCookie = request.cookies[COOKIE_NAME];
        if (existingCookie && (existingCookie.value === 'stable' || existingCookie.value === 'canary')) {
            bucket = existingCookie.value;
        } else {
            var weight = DEFAULT_WEIGHT_PERCENT;
            try {
                var weightValue = await kvsHandle.get(KVS_WEIGHT_KEY);
                var parsedWeight = parseInt(weightValue, 10);
                if (!isNaN(parsedWeight) && parsedWeight >= 0 && parsedWeight <= 100) {
                    weight = parsedWeight;
                }
            } catch (err) {
                // KVSに未設定の場合は既定値のまま進める
            }
            bucket = Math.random() * 100 < weight ? 'canary' : 'stable';
            isNewAssignment = true;
        }
    }

    request.uri = '/' + bucket + request.uri;
    // S3オリジン（REST APIエンドポイント）はURIが"/"で終わる場合にindex.htmlを
    // 自動補完しない。ルートパスはプレフィックス付与だけでは"/stable/"のように
    // スラッシュで終わってしまい404になる
    if (request.uri.endsWith('/')) {
        request.uri += 'index.html';
    }

    if (isNewAssignment) {
        request.headers[NEW_ASSIGNMENT_HEADER] = { value: bucket };
    }

    return request;
}
