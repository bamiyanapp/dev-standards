// ブルーグリーン（stable/canary）デプロイパターン: CloudFront Functions
// viewer-response関数のコピー＆調整用テンプレート。
// 詳細は ../blue-green-stage-pattern.md 「CloudFront Functionsによる重み付けルーティング」を参照。

function handler(event) {
    var request = event.request;
    var response = event.response;

    var newAssignment = request.headers['x-bg-new-assignment'];
    if (newAssignment && newAssignment.value) {
        response.cookies['canary'] = {
            value: newAssignment.value,
            attributes: 'Max-Age=604800; Path=/; Secure; HttpOnly; SameSite=Lax'
        };
    }

    return response;
}
