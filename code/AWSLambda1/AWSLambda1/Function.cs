using Amazon.Lambda.Core;
using Amazon.Lambda.RuntimeSupport;
using Amazon.Lambda.Serialization.Json;
using Amazon.S3;
using Amazon.S3.Model;
using OfficeOpenXml;
using OfficeOpenXml.Style;
using System;
using System.IO;
using System.Threading.Tasks;

namespace AWSLambda1
{
    public class Function
    {
        /// <summary>
        /// The main entry point for the custom runtime.
        /// </summary>
        /// <param name="args"></param>
        private static async Task Main(string[] args)
        {
            Func<string, ILambdaContext, string> func = FunctionHandler;
            using(var handlerWrapper = HandlerWrapper.GetHandlerWrapper(func, new JsonSerializer()))
            using(var bootstrap = new LambdaBootstrap(handlerWrapper))
            {
                await bootstrap.RunAsync();
            }
        }

        /// <summary>
        /// A simple function that takes a string and does a ToUpper
        ///
        /// To use this handler to respond to an AWS event, reference the appropriate package from 
        /// https://github.com/aws/aws-lambda-dotnet#events
        /// and change the string input parameter to the desired event type.
        /// </summary>
        /// <param name="input"></param>
        /// <param name="context"></param>
        /// <returns></returns>
        public static string FunctionHandler(string input, ILambdaContext context)
        {
            ExportExcel(context);
            return input?.ToUpper();
        }

        private static void ExportExcel(ILambdaContext context)
        {
            string newFile = $@"template-{DateTime.Now.Ticks.ToString()}.xlsx";
            IAmazonS3 client = new AmazonS3Client(Amazon.RegionEndpoint.USEast2);

            using (var ms = new MemoryStream())
            {

                using (ExcelPackage package = new ExcelPackage(ms))
                {
                    // add a new worksheet to the empty workbook
                    ExcelWorksheet worksheet = package.Workbook.Worksheets.Add("Inventory");
                    //Add the headers
                    worksheet.Cells[1, 1].Value = "ID";
                    worksheet.Cells[1, 2].Value = "Product";
                    worksheet.Cells[1, 3].Value = "Quantity";
                    worksheet.Cells[1, 4].Value = "Price";
                    worksheet.Cells[1, 5].Value = "Value";

                    //Add some items...
                    worksheet.Cells["A2"].Value = 12001;
                    worksheet.Cells["B2"].Value = "Nails";
                    worksheet.Cells["C2"].Value = 37;
                    worksheet.Cells["D2"].Value = 3.99;

                    worksheet.Cells["A3"].Value = 12002;
                    worksheet.Cells["B3"].Value = "Hammer";
                    worksheet.Cells["C3"].Value = 5;
                    worksheet.Cells["D3"].Value = 12.10;

                    worksheet.Cells["A4"].Value = 12003;
                    worksheet.Cells["B4"].Value = "Saw";
                    worksheet.Cells["C4"].Value = 12;
                    worksheet.Cells["D4"].Value = 15.37;

                    //Add a formula for the value-column
                    worksheet.Cells["E2:E4"].Formula = "C2*D2";

                    //Ok now format the values;
                    using (var range = worksheet.Cells[1, 1, 1, 5])
                    {
                        range.Style.Font.Bold = true;
                        range.Style.Fill.PatternType = ExcelFillStyle.Solid;
                        //range.Style.Fill.BackgroundColor.SetColor(Color.DarkBlue);
                        //range.Style.Font.Color.SetColor(Color.White);
                    }

                    worksheet.Cells["A5:E5"].Style.Border.Top.Style = ExcelBorderStyle.Thin;
                    worksheet.Cells["A5:E5"].Style.Font.Bold = true;

                    worksheet.Cells[5, 3, 5, 5].Formula = string.Format("SUBTOTAL(9,{0})", new ExcelAddress(2, 3, 4, 3).Address);
                    worksheet.Cells["C2:C5"].Style.Numberformat.Format = "#,##0";
                    worksheet.Cells["D2:E5"].Style.Numberformat.Format = "#,##0.00";

                    //Create an autofilter for the range
                    worksheet.Cells["A1:E4"].AutoFilter = true;

                    worksheet.Cells["A2:A4"].Style.Numberformat.Format = "@";   //Format as text

                    //There is actually no need to calculate, Excel will do it for you, but in some cases it might be useful.
                    //For example if you link to this workbook from another workbook or you will open the workbook in a program that hasn't a calculation engine or
                    //you want to use the result of a formula in your program.
                    worksheet.Calculate();

                    worksheet.Cells.AutoFitColumns(0);  //Autofit columns for all cells

                    // lets set the header text
                    worksheet.HeaderFooter.OddHeader.CenteredText = "&24&U&\"Arial,Regular Bold\" Inventory";
                    // add the page number to the footer plus the total number of pages
                    worksheet.HeaderFooter.OddFooter.RightAlignedText =
                        string.Format("Page {0} of {1}", ExcelHeaderFooter.PageNumber, ExcelHeaderFooter.NumberOfPages);
                    // add the sheet name to the footer
                    worksheet.HeaderFooter.OddFooter.CenteredText = ExcelHeaderFooter.SheetName;
                    // add the file path to the footer
                    worksheet.HeaderFooter.OddFooter.LeftAlignedText = ExcelHeaderFooter.FilePath + ExcelHeaderFooter.FileName;

                    worksheet.PrinterSettings.RepeatRows = worksheet.Cells["1:2"];
                    worksheet.PrinterSettings.RepeatColumns = worksheet.Cells["A:G"];

                    // Change the sheet view to show it in page layout mode
                    worksheet.View.PageLayoutView = true;

                    // set some document properties
                    package.Workbook.Properties.Title = "Invertory";
                    package.Workbook.Properties.Author = "Jan Källman";
                    package.Workbook.Properties.Comments = "This sample demonstrates how to create an Excel 2007 workbook using EPPlus";

                    // set some extended property values
                    package.Workbook.Properties.Company = "AdventureWorks Inc.";

                    // set some custom property values
                    package.Workbook.Properties.SetCustomPropertyValue("Checked by", "Jan Källman");
                    package.Workbook.Properties.SetCustomPropertyValue("AssemblyName", "EPPlus");
                    // save our new workbook and we are done!
                    package.Save();
                }

                PutObjectRequest request = new PutObjectRequest()
                {
                    BucketName = "awsserverless-robk",
                    Key = newFile,
                    InputStream = ms
                };

                var resp = client.PutObjectAsync(request).Result;
            }
            Console.WriteLine("Excel Done");
            context.Logger.LogLine("Excel Done\n");
        }
    }
}
