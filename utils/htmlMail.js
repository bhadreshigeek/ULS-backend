module.exports = (subject, body) => {
  return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/1.3.2/jspdf.min.js"></script>
        <title>Order successfull</title>
        <style>
        body{
            margin:10px !important;
        }
    </style>
    </head>
        <body>
        <table width="100%" border="0" cellspacing="0" cellpadding="0"><tr><td width="600" align="center">
        <table width="600" border="0" cellspacing="0" cellpadding="0" >
        <tr>
            <td style="text-align: center; width="100%" align="center">
            <img height="150px" src="https://firebasestorage.googleapis.com/v0/b/thoughtcast-magic.appspot.com/o/logo%20(1).png?alt=media" />
            <h1 style="text-align: center;">
            <b>
            ${subject}
            </b>
            </h1>
            <div style="text-align: left;width:100%;">
            <p>
            ${body}
            </p>
            <p>-ThoughtCast Magic</p>
            </div>
            </td>
        </tr>
    </table>
    </td>
    </tr>
    </table>
        </body>
    </html>`;
};
